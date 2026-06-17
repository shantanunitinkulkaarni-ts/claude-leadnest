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
  for (const m of text.matchAll(PRICE_PREFIXED_RE)) {
    push(parseAmount(m[1], m[2]))
  }

  // ── (2) Unit-suffixed ("85 lakh", "1.2 crore" — no currency prefix) ─────
  for (const m of text.matchAll(PRICE_SUFFIXED_RE)) {
    const start = m.index ?? 0
    // Same proximity guard as bare numbers: skip if "sqft"/"size"/"carpet"
    // appears within ~15 chars AFTER the figure (e.g. "5 lakh sqft").
    const after = text.slice(start, start + (m[0]?.length || 0) + 15)
    if (BARE_EXCLUDE_RE.test(after)) continue
    push(parseAmount(m[1], m[2]))
  }

  // ── (3) Bare 6-8 digit rupee numbers (cheap context guard) ──────────────
  for (const m of text.matchAll(PRICE_BARE_RE)) {
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

// Checks every rupee figure quoted in `reply` against the agent's actual
// property inventory (rent_per_month for rentals, price for sales), within a
// 5% tolerance to absorb rounding ("₹80L" for a ₹78.5L property is fine).
export function validateReply(reply: string, properties: any[]): ValidationResult {
  const quotedPrices = extractPrices(reply)
  for (const price of quotedPrices) {
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
