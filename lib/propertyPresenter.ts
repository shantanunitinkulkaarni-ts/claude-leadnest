// ─────────────────────────────────────────────────────────────────────────────
// PROPERTY PRESENTER  (code-first — the AI NEVER types a property fact)
// ─────────────────────────────────────────────────────────────────────────────
// Builds the customer-facing property message ENTIRELY from database values.
// Every price/size/spec is copied verbatim from the row — nothing is generated,
// paraphrased, or inferred. This is the core of the "code acts" half of the bot
// architecture (see memory bot-architecture-ai-decodes-code-acts): an invented
// "₹18,000 rental in Baner" is impossible because the AI is not in this path.
//
// Pure + fully unit-tested. The orchestrator calls this; the webhook sends the
// returned text + photos.

import { extractPropertyMedia, MAX_IMAGES_PER_SEND } from './media'

export const MAX_SHOWN = 3

export type PresentResult = {
  text: string          // intro + property block(s) (+ "want a call?" if overflow)
  photos: string[]      // photo URLs to send for the shown properties (capped)
  shownIds: string[]    // ids of the properties shown (for matched_property tracking)
  overflow: boolean     // more matches existed than we showed → offer a call
}

const POSSESSION_LABEL: Record<string, string> = {
  ready_to_move: 'Ready to move', under_construction: 'Under construction',
  new_launch: 'New launch', resale: 'Resale',
}

function inr(n: number): string { return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN') }

// Exact price string straight from the row. Sale → lakh/crore; rental → /month.
export function priceText(p: any): string {
  if (p.type === 'rental') {
    const rent = Number(p.rent_per_month) || Number(p.price) || 0
    const dep = Number(p.deposit) ? ` (deposit ${inr(p.deposit)})` : ''
    return `${inr(rent)}/month${dep}`
  }
  const price = Number(p.price) || 0
  if (price >= 1e7) {
    const cr = (price / 1e7).toFixed(2).replace(/\.?0+$/, '')
    return `₹${cr} Cr`
  }
  if (price >= 1e5) return `₹${Math.round(price / 1e5)}L`
  return inr(price)
}

// One property → a clean WhatsApp block. Only fields present in the row appear;
// nothing is invented or defaulted to a made-up value.
export function buildPropertyBlock(p: any): string {
  const lines: string[] = []
  const desc = [p.bhk, p.category].filter(Boolean).join(' ')
  lines.push(`🏠 *${p.title || 'Property'}*${desc ? ` — ${desc}` : ''}${p.location ? ` in ${p.location}` : ''}`)
  lines.push(`💰 ${priceText(p)}`)
  if (p.size_sqft) lines.push(`📐 ${p.size_sqft} sqft`)
  if (p.possession_status) {
    const poss = (POSSESSION_LABEL[p.possession_status] || p.possession_status)
      + (p.possession_date ? ` (by ${p.possession_date})` : '')
    lines.push(`🏗️ ${poss}`)
  }
  const amenities = (p.features || []).filter((f: any) => typeof f === 'string' && !f.startsWith('media:'))
  if (amenities.length) lines.push(`✨ ${amenities.slice(0, 6).join(', ')}`)
  return lines.join('\n')
}

// Build the full presentation for the matched properties (already filtered +
// ranked best-first by the caller). Shows up to MAX_SHOWN; flags overflow.
export function presentProperties(matched: any[], opts?: { intro?: string }): PresentResult {
  const list = Array.isArray(matched) ? matched : []
  const shown = list.slice(0, MAX_SHOWN)
  const overflow = list.length > MAX_SHOWN
  const intro = opts?.intro ?? (shown.length === 1
    ? 'Here’s a property matching your search:'
    : `Here are ${shown.length} properties matching your search:`)
  const blocks = shown.map(buildPropertyBlock).join('\n\n')
  let text = shown.length ? `${intro}\n\n${blocks}` : noMatchText()
  if (overflow) text += `\n\nI have more options too — would you like a quick call to go over them?`

  const photos: string[] = []
  for (const p of shown) {
    for (const url of extractPropertyMedia(p)) {
      if (photos.length >= MAX_IMAGES_PER_SEND) break
      if (!photos.includes(url)) photos.push(url)
    }
  }
  return { text, photos, shownIds: shown.map(p => p.id), overflow }
}

// Customer-facing "nothing matches" line. The caller appends the agent card.
export function noMatchText(): string {
  return "I don't have a property matching that exactly right now."
}

// Nearby intro — produces the prefix when properties come from adjacent areas.
// Example: "I don't have anything in Baner right now, but here's Aundh:"
// Stable marker phrases — used BOTH to build the intro and to detect it later
// (the orchestrator's follow-up check). Co-located so the two can never drift
// apart (a test pins the round-trip: nearbyIntro() output → isNearbyIntro() true).
const NEARBY_INTRO_HEAD = "I don't have anything in"
const NEARBY_INTRO_TAIL = 'but here are'

export function nearbyIntro(requestedAreas: string[], nearbyAreas: string[]): string {
  const requested = (requestedAreas || []).map(a => a.replace(/\b\w/g, c => c.toUpperCase())).join(' or ')
  const nearby = (nearbyAreas || []).join(', ')
  if (!nearby) return `${NEARBY_INTRO_HEAD} ${requested} right now, ${NEARBY_INTRO_TAIL} some nearby options:`
  return `${NEARBY_INTRO_HEAD} ${requested} right now, ${NEARBY_INTRO_TAIL} properties in nearby ${nearby}:`
}

// True if a bot message is a nearby-area presentation. The orchestrator uses this
// to detect a follow-up (so it defers refinement to the AI engine instead of
// re-firing the same nearby message). Single source of truth with nearbyIntro.
export function isNearbyIntro(text: string | null | undefined): boolean {
  if (!text) return false
  return text.includes(NEARBY_INTRO_HEAD) && text.includes(NEARBY_INTRO_TAIL)
}
