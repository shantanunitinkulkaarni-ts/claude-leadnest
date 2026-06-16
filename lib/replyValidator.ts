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

const PRICE_RE = /₹\s*([\d,]+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l)?\b/gi

function parseAmount(numStr: string, unit?: string): number {
  const n = parseFloat(numStr.replace(/,/g, ''))
  const u = (unit || '').toLowerCase()
  if (u.startsWith('cr')) return n * CRORE
  if (u.startsWith('l')) return n * LAKH
  return n
}

// Extracts every rupee figure mentioned in `text`. Only matches amounts
// prefixed with ₹ — bare numbers ("3BHK", "2 bedrooms") are never treated as
// prices, so this never false-positives on unrelated digits in the reply.
export function extractPrices(text: string): number[] {
  const prices: number[] = []
  const re = new RegExp(PRICE_RE)
  let m: RegExpExecArray | null
  while ((m = re.exec(text || '')) !== null) {
    const amount = parseAmount(m[1], m[2])
    if (amount > 0) prices.push(amount)
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
