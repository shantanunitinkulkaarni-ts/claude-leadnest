// ─── Indian budget parsing (pure, testable) ─────────────────────────────────
// LLMs occasionally mis-scale Indian budgets — e.g. "50 lakh" extracted as
// 5,00,000 instead of 50,00,000 (a 10× error), which then silently mis-qualifies
// the lead and breaks property matching. This parses the figure straight from
// the lead's own words so the webhook can sanity-check the LLM's number.

// Parse the clearest Indian-style budget figure from free text into plain rupees.
// Handles "50 lakh", "50lakh", "50 lac", "50L", "1.2 crore", "1.2cr",
// "₹95 lakh", and ranges like "50-60 lakh" (takes the upper figure).
// Returns null when there's no recognizable lakh/crore figure.
export function parseBudgetRupees(text: string): number | null {
  if (!text) return null
  const t = text.toLowerCase().replace(/,/g, '')

  // Crore first (the larger unit) — take the LAST crore figure (upper of a range).
  const crore = Array.from(t.matchAll(/(\d+(?:\.\d+)?)\s*(?:crore|cr)\b/g))
  if (crore.length) return Math.round(parseFloat(crore[crore.length - 1][1]) * 10000000)

  // Then lakh / lac / bare "L".
  const lakh = Array.from(t.matchAll(/(\d+(?:\.\d+)?)\s*(?:lakhs|lakh|lacs|lac|l)\b/g))
  if (lakh.length) return Math.round(parseFloat(lakh[lakh.length - 1][1]) * 100000)

  return null
}

// True when `llmValue` is grossly out of scale (≥3×) versus the figure parsed
// from the lead's text — i.e. an order-of-magnitude extraction error, not just
// a reasonable range/rounding difference.
export function isGrosslyOffBudget(llmValue: number | null | undefined, textValue: number): boolean {
  if (!llmValue) return true
  return llmValue < textValue / 3 || llmValue > textValue * 3
}
