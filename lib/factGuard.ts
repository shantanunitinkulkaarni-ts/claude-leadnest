// ─────────────────────────────────────────────────────────────────────────────
// Fact guard — last line of defense against fabricated FACTS (not just prices).
//
// The reply validator (lib/replyValidator.ts) catches price hallucinations only
// for ₹-prefixed amounts. That misses an entire class of confidence-destroying
// bugs the founder keeps reporting:
//   • Invented possession dates ("December 2026") on under-construction units
//     where inventory has no date.
//   • Invented direction / vastu ("east facing") when the inventory doesn't say.
//   • Invented parking ("2 covered spots") when not listed.
//   • Invented an AREA being in the agent's inventory.
//
// This module runs AFTER the LLM but BEFORE the reply leaves the webhook. When
// it catches a fabrication it does NOT silently drop — it surgically rewrites
// the offending sentence to an honest defer ("let me confirm with the team")
// and surfaces a Sentry warning so we see how often this happens.
//
// Design principles, mirroring lib/replyValidator.ts:
//   1. HIGH PRECISION over recall. False positives erode the bot's helpfulness;
//      pattern matches are deliberately conservative.
//   2. Pure function — no I/O, no LLM calls — fully unit-testable.
//   3. The matched property (when known) is the source of truth. When no
//      property is matched, we only catch claims that are universally invented
//      (e.g. a specific month+year possession on something we have no data for).
// ─────────────────────────────────────────────────────────────────────────────

export interface FactGuardResult {
  reply: string                  // possibly-rewritten reply
  rewritten: boolean             // true if we replaced any sentence
  fabrications: string[]         // diagnostic list of what we caught
}

// A specific month + year, e.g. "December 2026" / "Dec '26" / "12/2026".
// Used to detect invented possession dates. We intentionally don't match a
// bare year ("2026") — a property might legitimately say "delivery in 2026".
const POSSESSION_DATE_RE =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\s,'’`-]*'?(20\d{2})\b/i

// Cardinal direction claims — east/west/north/south facing, vastu-compatible.
// Pattern only matches a clear directional CLAIM about the property, not a
// generic mention of vastu as a concept.
const DIRECTION_CLAIM_RE = /\b(east|west|north|south|north[\s-]?east|north[\s-]?west|south[\s-]?east|south[\s-]?west)\s*-?\s*facing\b/i

// Parking claims — "2 covered parking", "covered parking", "basement parking".
// Generic mention ("we'll check parking") is fine; a SPECIFIC claim is what
// we guard against.
const PARKING_CLAIM_RE = /\b(\d+\s+)?(covered|basement|stilt|open|reserved)\s+park(ing)?\b/i

// Helper: extracts the substring matching `re` from `text` (case-insensitive).
function extract(text: string, re: RegExp): string | null {
  const m = text.match(re)
  return m ? m[0] : null
}

// Helper: does the property's inventory data support the claim?
// `inventoryText` is the concatenated lowercased searchable string of every
// inventory field that could substantiate the claim (description, features,
// HIGHLIGHTS, possession_status). Comparison is forgiving on whitespace and
// hyphens so "East-facing" in features matches "east facing" in the reply.
function inventoryMentions(inventoryText: string, claim: string): boolean {
  if (!claim) return false
  const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_]+/g, ' ').trim()
  const c = normalize(claim)
  const blob = normalize(inventoryText)
  if (blob.includes(c)) return true
  // Token fallback so "2 covered parking" matches "covered parking for 2 cars".
  const tokens = c.split(' ').filter(t => t.length >= 4)
  return tokens.length > 0 && tokens.every(t => blob.includes(t))
}

// Builds the searchable lowercased text for a property — every field that
// could substantiate a factual claim about the unit.
export function inventoryFactBlob(property: any): string {
  if (!property) return ''
  const parts: string[] = []
  for (const key of ['title', 'location', 'description', 'extra_info', 'possession_status', 'possession_date', 'bhk', 'category']) {
    const v = property[key]
    if (typeof v === 'string') parts.push(v)
  }
  const features = property.features
  if (Array.isArray(features)) {
    for (const f of features) if (typeof f === 'string' && !f.startsWith('media:')) parts.push(f)
  }
  return parts.join(' ').toLowerCase()
}

// Rewrite the offending fragment with an honest defer. We don't try to remove
// the entire sentence — that often breaks reply grammar. We replace the
// specific claim with a soft "let me confirm with the team" interjection.
const HONEST_DEFER = "let me confirm that with the team"

function rewriteSentence(reply: string, badFragment: string): string {
  // Replace the bad fragment with the defer phrase, then collapse double-spaces.
  // Case-insensitive single replacement (the FIRST occurrence per fragment).
  const idx = reply.toLowerCase().indexOf(badFragment.toLowerCase())
  if (idx < 0) return reply
  const before = reply.slice(0, idx)
  const after = reply.slice(idx + badFragment.length)
  return (before + HONEST_DEFER + after).replace(/[ \t]{2,}/g, ' ').trim()
}

// Checks the reply against the matched property (if any) and returns a result.
// When `matchedProperty` is null the guard still catches claims that are
// universally suspicious without grounding (a specific possession month+year).
export function guardReplyFacts(
  reply: string,
  matchedProperty: any | null
): FactGuardResult {
  const fabrications: string[] = []
  let out = reply

  const blob = inventoryFactBlob(matchedProperty)

  // ── Possession date claim ──────────────────────────────────────────────
  // A specific month+year possession claim is suspicious unless inventory
  // *has any possession_date value at all*. We don't try to match the exact
  // format (DB might store "2026-12-15", LLM might say "December 2026" — those
  // refer to the same fact, and a string-equality check would false-positive).
  // The founder's actual pain: bot inventing a date when inventory has NONE.
  // So the rule is binary — possession_date present in inventory? trust the
  // LLM. Absent? flag any specific date claim.
  const possessionClaim = extract(out, POSSESSION_DATE_RE)
  if (possessionClaim) {
    const inventoryHasDate = !!(matchedProperty && typeof matchedProperty.possession_date === 'string' && matchedProperty.possession_date.trim())
    if (!inventoryHasDate) {
      fabrications.push(`possession_date:${possessionClaim}`)
      out = rewriteSentence(out, possessionClaim)
    }
  }

  // ── Direction / facing claim ────────────────────────────────────────────
  // A "south-facing" assertion has to exist in inventory features.
  const directionClaim = extract(out, DIRECTION_CLAIM_RE)
  if (directionClaim) {
    if (!matchedProperty || !inventoryMentions(blob, directionClaim)) {
      fabrications.push(`direction:${directionClaim}`)
      out = rewriteSentence(out, directionClaim)
    }
  }

  // ── Parking claim ───────────────────────────────────────────────────────
  // A SPECIFIC parking claim ("2 covered parking") must be in inventory.
  // We only guard this when there IS a matched property to validate against —
  // when no property is matched and the bot says generic "parking is included",
  // it's not specific enough to be a fabrication.
  if (matchedProperty) {
    const parkingClaim = extract(out, PARKING_CLAIM_RE)
    if (parkingClaim && !inventoryMentions(blob, parkingClaim)) {
      fabrications.push(`parking:${parkingClaim}`)
      out = rewriteSentence(out, parkingClaim)
    }
  }

  return {
    reply: out,
    rewritten: fabrications.length > 0,
    fabrications,
  }
}
