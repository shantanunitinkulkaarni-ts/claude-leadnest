// ─────────────────────────────────────────────────────────────────────────────
// Reply validator — last line of defense against price hallucination.
//
// The property pre-filter (lib/propertyMatcher.ts) stops the LLM from being
// SHOWN the wrong property. This catches what that can't: the LLM still sees
// real prices for the properties it WAS shown, but is free-text generating the
// reply, so it can transpose digits, round oddly ("₹80L" instead of ₹78.5L),
// or just invent a figure. Before a reply reaches a lead, every rupee amount
// it mentions must match a real property's price (or rent) within tolerance.
// ─────────────────────────────────────────────────────────────────────────────

const LAKH = 100_000
const CRORE = 10_000_000
const PRICE_TOLERANCE = 0.05 // 5%

// Match an Indian-style rupee amount. Covers four flavors the LLM is known to
// emit (and one is enough to fabricate a price): "₹85 lakh", "Rs 85 lakh",
// "rupees 85L", and bare 6-8 digit numbers like "9500000" / "95,00,000".
//
// CAREFUL: bare-number matching is restricted to 6-8 digits and require either
// a currency word/symbol nearby OR a "lakh/crore/L/cr" suffix — otherwise this
// would mis-flag a phone number, a property size, or a sqft figure.
const PREFIX = '(?:₹|rs\\.?|inr|rupees?)'
const UNIT = '(?:crore|cr|lakhs?|lacs?|l)\\b'
const PRICE_PREFIXED_RE = new RegExp(`${PREFIX}\\s*([\\d,]+(?:\\.\\d+)?)\\s*(${UNIT})?`, 'gi')
const PRICE_SUFFIXED_RE = new RegExp(`(?<![\\d.,])(\\d+(?:\\.\\d+)?)\\s*(${UNIT})(?![\\w.])`, 'gi')
// Bare big numbers (6-8 digits) — only if NOT preceded by "sqft", "sq ft",
// "sq.", "size", or "phone" (cheap proximity check via lookbehind on the
// last ~12 chars). Range = ₹1L–₹9.99Cr in plain rupees.
const PRICE_BARE_RE = /(?<![\d.,])([1-9]\d{5,7})(?![\d.])/g
const BARE_EXCLUDE_RE = /(sq\.?\s*ft|sqft|size|phone|number|whatsapp|carpet|built[\s-]*up|super[\s-]*built)/i

function parseAmount(numStr: string, unit?: string): number {
  const n = parseFloat(numStr.replace(/,/g, ''))
  const u = (unit || '').toLowerCase()
  if (u.startsWith('cr')) return n * CRORE
  if (u.startsWith('l')) return n * LAKH
  return n
}

// Extracts every rupee figure mentioned in `text`. Three patterns combined:
//   1. ₹/Rs/Rupees prefixed amounts ("₹85L", "Rs 85 lakh", "rupees 9500000")
//   2. Unit-suffixed amounts ("85 lakh", "1.2 crore") even without ₹
//   3. Bare 6-8 digit rupee figures ("9500000", "95,00,000") when not near
//      a sqft/phone/size keyword
// Stays HIGH PRECISION (never flags a real sqft/phone number as a price).
export function extractPrices(text: string): number[] {
  if (!text) return []
  const prices: number[] = []
  const seenAmounts = new Set<number>() // dedupe across the 3 regexes (and repeats in one reply)

  const push = (amount: number) => {
    if (amount <= 0) return
    if (seenAmounts.has(amount)) return
    seenAmounts.add(amount)
    prices.push(amount)
  }

  // ── (1) Currency-prefixed ───────────────────────────────────────────────
  for (const m of Array.from(text.matchAll(PRICE_PREFIXED_RE))) {
    push(parseAmount(m[1], m[2]))
  }

  // ── (2) Unit-suffixed ("85 lakh", "1.2 crore" — no currency prefix) ─────
  for (const m of Array.from(text.matchAll(PRICE_SUFFIXED_RE))) {
    const start = m.index ?? 0
    // Same proximity guard as bare numbers: skip if "sqft"/"size"/"carpet"
    // appears within ~15 chars AFTER the figure (e.g. "5 lakh sqft").
    const after = text.slice(start, start + (m[0]?.length || 0) + 15)
    if (BARE_EXCLUDE_RE.test(after)) continue
    push(parseAmount(m[1], m[2]))
  }

  // ── (3) Bare 6-8 digit rupee numbers (cheap context guard) ──────────────
  for (const m of Array.from(text.matchAll(PRICE_BARE_RE))) {
    const start = m.index ?? 0
    // Skip if a sqft/phone/size keyword is within ~15 chars before this number.
    const ctxStart = Math.max(0, start - 15)
    const ctx = text.slice(ctxStart, start)
    if (BARE_EXCLUDE_RE.test(ctx)) continue
    push(parseAmount(m[1]))
  }

  return prices
}

export interface ValidationResult {
  valid: boolean
  reason?: string
  price?: number
}

// ─── Suspicion heuristics ──────────────────────────────────────────────────
// Tightened after a production loop where the bot's reply was nuked 3 turns
// in a row because validateReply caught the LEAD'S budget echo ("₹70L") and
// a delta ("₹20L over your budget") as fabricated prices. The validator must
// ONLY flag prices that look like a property-attribution claim, not budget
// echoes or comparator/delta language.

// True if the price reads as a DELTA (a difference/comparison amount) rather
// than a property-price claim. Two patterns:
//
//   INTRO: a delta-introducing word IMMEDIATELY BEFORE the price (within ~12
//          chars). "just ₹20L", "only ₹5L", "by ₹10L", "approximately ₹50K",
//          "around ₹15L", "extra ₹5L". These unambiguously mark a delta.
//
//   OUTRO: a comparison/fee word IMMEDIATELY AFTER the price (within ~15
//          chars). "₹15L cheaper", "₹20L more", "₹5L difference", "₹50k
//          booking", "₹2L token", "₹35k GST/registration/brokerage".
//
// We deliberately EXCLUDE "over/above/under/below" from these lists — those
// describe the position of the price relative to something else, but the
// PRICE itself is still a real property-price claim ("Lodha is at ₹90L, above
// your budget" — ₹90L is the property price, not a delta).
const DELTA_INTRO_RE = /\b(just|only|by|extra|additional|approx\.?|approximately|around|plus|minus)\s*[^\d]{0,6}$/i
const DELTA_OUTRO_RE = /^[^\w]{0,3}\s*(cheaper|costlier|higher|lower|more|less|difference|booking|token|deposit|advance|fee|gst|registration|stamp|brokerage|maintenance|emi|premium|charges?)\b/i

function priceIsDeltaContext(reply: string, price: number): boolean {
  if (!reply) return false
  // Build plausible string forms of the price so we can locate it. Includes:
  //   • unit-suffixed ("90 lakh" / "90l" / "1.2 crore")
  //   • plain ("9000000")
  //   • Indian-comma ("50,000" / "90,00,000") — the form the bot actually
  //     emits, missing this caused booking-amount deltas to be unfindable
  //     and fall through to the inventory check.
  const candidates: string[] = []
  if (price >= CRORE) {
    const cr = (price / CRORE).toFixed(2).replace(/\.?0+$/, '')
    candidates.push(`${cr} crore`, `${cr}cr`)
  }
  if (price >= LAKH) {
    const lk = Math.round(price / LAKH).toString()
    candidates.push(`${lk} lakh`, `${lk}l`, `${lk} l`)
  }
  candidates.push(`${price}`)
  try { candidates.push(price.toLocaleString('en-IN')) } catch { /* best-effort */ }
  const lower = reply.toLowerCase()
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase())
    if (idx < 0) continue
    const before = lower.slice(Math.max(0, idx - 15), idx)
    if (DELTA_INTRO_RE.test(before)) return true
    const after = lower.slice(idx + c.length, Math.min(lower.length, idx + c.length + 15))
    if (DELTA_OUTRO_RE.test(after)) return true
  }
  return false
}

function priceMatchesLeadBudget(price: number, lead: any): boolean {
  if (!lead) return false
  const tol = 0.10 // 10% — leads round their stated budget verbally
  for (const k of ['budget_min', 'budget_max'] as const) {
    const b = lead?.[k]
    if (typeof b === 'number' && b > 0 && Math.abs(b - price) <= b * tol) return true
  }
  return false
}

// Checks every rupee figure quoted in `reply` against the agent's actual
// property inventory. A price is FLAGGED only when ALL the following are true:
//   1. It is ≥ ₹10k (avoids token amounts, GST digits, page-footer noise)
//   2. It is NOT in a comparator/delta context ("just/by/cheaper/booking")
//   3. It does NOT match the lead's stated budget (echoing budget is fine)
//   4. It does NOT match any inventory property's price (within 5%)
// This is high-precision: false positives erode the bot's helpfulness and
// caused a production loop where every reply got nuked to a canned fallback.
export function validateReply(reply: string, properties: any[], lead?: any): ValidationResult {
  const quotedPrices = extractPrices(reply)
  for (const price of quotedPrices) {
    // (1) Skip trivially small amounts — under ₹10k is almost always a token
    // amount, GST percentage written as plain digits, page footer, or noise.
    // Rentals (₹15k–₹2L/month) and sales (₹25L+) both clear this floor; only
    // genuine non-property numbers get filtered.
    if (price < 10_000) continue

    // (2) Skip if the price appears in a comparator/delta phrase.
    if (priceIsDeltaContext(reply, price)) continue

    // (3) Skip if the price echoes the lead's stated budget (within 10%).
    if (priceMatchesLeadBudget(price, lead)) continue

    // (4) Must match some inventory price within 5%, otherwise FLAG.
    const matchesInventory = (properties || []).some((p) => {
      const actual = p.type === 'rental' ? p.rent_per_month : p.price
      if (!actual) return false
      return Math.abs(actual - price) <= actual * PRICE_TOLERANCE
    })
    if (!matchesInventory) {
      return { valid: false, reason: 'price_not_in_inventory', price }
    }
  }
  return { valid: true }
}
