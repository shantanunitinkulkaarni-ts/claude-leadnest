import { test, expect } from '@playwright/test'
import { extractPrices, validateReply } from '../../lib/replyValidator'

test.describe('extractPrices', () => {
  test('extracts lakh figures', () => {
    expect(extractPrices('It is priced at ₹79L for the 2BHK')).toEqual([7_900_000])
  })

  test('extracts crore figures', () => {
    expect(extractPrices('Budget friendly at ₹1.45Cr')).toEqual([14_500_000])
  })

  test('extracts plain rupee figures with commas', () => {
    expect(extractPrices('Rent is ₹30,000/month')).toEqual([30_000])
  })

  test('extracts multiple figures from one reply', () => {
    expect(extractPrices('Option A is ₹79L, option B is ₹1.2Cr')).toEqual([7_900_000, 12_000_000])
  })

  test('bare numbers without ₹ are never treated as prices', () => {
    expect(extractPrices('It is a 3BHK with 1050 sqft, 2 bathrooms')).toEqual([])
  })

  test('no rupee figures returns empty array', () => {
    expect(extractPrices('Sure, let me check and get back to you!')).toEqual([])
  })

  // ── Expanded price extraction (Rs / rupees / bare large numbers) ─────────
  test('Rs-prefixed amounts are extracted', () => {
    expect(extractPrices('Price is Rs 85 lakh for this 2BHK')).toEqual([8_500_000])
  })

  test('Rupees-spelled-out amounts are extracted', () => {
    expect(extractPrices('Around rupees 9500000 final')).toEqual([9_500_000])
  })

  test('Unit-suffixed amounts without ₹ are extracted', () => {
    expect(extractPrices('Final is 85 lakh, listed for 1.2 crore')).toEqual([8_500_000, 12_000_000])
  })

  test('Bare 7-digit rupee figure is extracted', () => {
    expect(extractPrices('Listed at 9500000 currently')).toEqual([9_500_000])
  })

  test('sqft figures in lakh are NOT treated as price (sqft proximity guard)', () => {
    expect(extractPrices('Building has 5 lakh sqft total area')).toEqual([])
  })

  test('phone numbers (10 digits) are NOT treated as prices', () => {
    expect(extractPrices('Call me on 9876543210 anytime')).toEqual([])
  })

  test('sqft bare numbers are NOT treated as prices', () => {
    expect(extractPrices('Carpet area 1080 sqft, super built-up 1450 sqft')).toEqual([])
  })

  test('mixed ₹ and unit-suffix in same reply deduplicates correctly', () => {
    // Both regexes will match "₹79L" — should dedupe by amount.
    expect(extractPrices('₹79L for this one')).toEqual([7_900_000])
  })
})

test.describe('validateReply', () => {
  const properties = [
    { id: 'p1', type: 'sale', price: 7_900_000 },
    { id: 'p2', type: 'sale', price: 14_500_000 },
    { id: 'p3', type: 'rental', rent_per_month: 30_000 },
  ]

  test('reply with no prices is always valid', () => {
    expect(validateReply('Sure, let me share more details!', properties)).toEqual({ valid: true })
  })

  test('reply quoting an exact inventory price is valid', () => {
    expect(validateReply('This one is ₹79L', properties)).toEqual({ valid: true })
  })

  test('reply quoting a rental rent_per_month is valid', () => {
    expect(validateReply('Rent is ₹30,000/month', properties)).toEqual({ valid: true })
  })

  test('reply within 5% tolerance is valid', () => {
    // 79L * 1.04 ≈ 82.16L — within 5% of 7,900,000
    expect(validateReply('Around ₹82L', properties).valid).toBe(true)
  })

  test('reply quoting a price outside 5% tolerance is invalid', () => {
    const result = validateReply('This one is ₹95L', properties)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('price_not_in_inventory')
    expect(result.price).toBe(9_500_000)
  })

  test('reply quoting a price with no matching property at all is invalid', () => {
    expect(validateReply('Special one-off deal at ₹50L', properties).valid).toBe(false)
  })

  test('empty inventory makes any quoted price invalid', () => {
    expect(validateReply('This one is ₹79L', []).valid).toBe(false)
  })

  test('rental price never matches against sale price field and vice versa', () => {
    // p4 is sale with no price set; ₹30L is large enough to be a property
    // claim (above the delta threshold), so the unmatched price still gets
    // flagged. (Previous test used ₹30,000 — below the ₹10k floor.)
    expect(validateReply('₹30L', [{ id: 'p4', type: 'sale', price: undefined }]).valid).toBe(false)
  })

  // ─── New behaviors (post production-loop fix) ─────────────────────────────

  test('small amounts / fee deltas are skipped (booking, GST)', () => {
    // ₹5L referenced as a delta — not a property claim — should NOT fail.
    expect(validateReply('Just ₹5L over your budget', properties).valid).toBe(true)
    expect(validateReply('₹50,000 booking amount', properties).valid).toBe(true)
  })

  test('prices in comparator/delta context are skipped (just/cheaper/difference)', () => {
    // "₹20L over" is a delta, not a property price claim — must not fail.
    expect(validateReply('Just ₹20L over your budget', properties).valid).toBe(true)
    expect(validateReply('₹15L cheaper than market', properties).valid).toBe(true)
    expect(validateReply('a ₹15L difference', properties).valid).toBe(true)
  })

  test("echoing the lead's stated budget is always valid (within 10%)", () => {
    const lead = { budget_max: 7_000_000 } // ₹70L
    // Bot says "your budget is ₹70L" — must not fail even though no property
    // exists at exactly ₹70L in this inventory.
    expect(validateReply('Your budget is ₹70L', properties, lead).valid).toBe(true)
    // 10% wobble — "around ₹75L budget" close enough.
    expect(validateReply('Around ₹75L budget', properties, lead).valid).toBe(true)
  })

  test('echoing budget_min is also allowed', () => {
    const lead = { budget_min: 5_000_000, budget_max: 8_000_000 }
    expect(validateReply('Starting from ₹50L', properties, lead).valid).toBe(true)
  })

  test('flagging still works for genuine fabrications outside both budget and inventory', () => {
    const lead = { budget_max: 7_000_000 }
    // ₹40L is not in inventory (7.9M/14.5M), not near lead's ₹70L budget,
    // and not in a delta context — must STILL be flagged.
    const result = validateReply('Final price ₹40L', properties, lead)
    expect(result.valid).toBe(false)
    expect(result.price).toBe(4_000_000)
  })

  test('regression: the production transcript bug no longer fires', () => {
    // Real production message that triggered the validator-nuke loop.
    // Lead's budget was ₹70L, Lodha is ₹90L (in inventory). Bot's reply
    // referenced both the budget echo and a delta — neither of which
    // should be flagged.
    const lead = { budget_max: 7_000_000 }
    const inv = [{ id: 'lodha', type: 'sale', price: 9_000_000 }]
    const reply = 'Lodha is at ₹90L — just ₹20L over your ₹70L budget, but it has great amenities.'
    expect(validateReply(reply, inv, lead).valid).toBe(true)
  })
})
