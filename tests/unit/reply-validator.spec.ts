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
    // p3 is rental with rent_per_month 30,000 — its `price` field is undefined,
    // so a sale-style large figure must not accidentally match it.
    expect(validateReply('₹30,000', [{ id: 'p4', type: 'sale', price: undefined }]).valid).toBe(false)
  })
})
