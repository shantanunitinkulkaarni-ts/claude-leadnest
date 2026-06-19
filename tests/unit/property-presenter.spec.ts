import { test, expect } from '@playwright/test'
import { buildPropertyBlock, presentProperties, priceText, noMatchText, MAX_SHOWN } from '../../lib/propertyPresenter'

// Real production inventory shape (the agency from the live hallucination bug).
const lodha = { id: 'lodha', title: 'Lodha', type: 'sale', bhk: '2BHK', category: 'Apartment', location: 'Baner', price: 9_000_000, size_sqft: 1050, possession_status: 'ready_to_move', features: ['Parking', 'Gym', 'media:https://x/1.jpg'], property_media: ['https://x/1.jpg', 'https://x/2.jpg'] }
const rental = { id: 'r1', title: 'Sky Rentals', type: 'rental', bhk: '2BHK', location: 'Wakad', rent_per_month: 18_000, deposit: 50_000, size_sqft: 900, features: ['Lift'] }
const crore = { id: 'c1', title: 'Lux Villa', type: 'sale', category: 'Villa', location: 'Baner', price: 25_000_000 }

test.describe('priceText — exact figures from the row', () => {
  test('sale in lakh', () => expect(priceText(lodha)).toBe('₹90L'))
  test('sale in crore (integer)', () => expect(priceText(crore)).toBe('₹2.5 Cr'))
  test('rental shows /month + deposit', () => expect(priceText(rental)).toBe('₹18,000/month (deposit ₹50,000)'))
  test('rental with no rent falls back to price field, never invents', () => {
    expect(priceText({ type: 'rental', rent_per_month: 0, price: 90_000 })).toBe('₹90,000/month')
  })
})

test.describe('buildPropertyBlock — only real fields, never invented', () => {
  test('shows title, bhk, location, exact price, size, possession, amenities', () => {
    const b = buildPropertyBlock(lodha)
    expect(b).toContain('*Lodha*')
    expect(b).toContain('2BHK')
    expect(b).toContain('in Baner')
    expect(b).toContain('₹90L')
    expect(b).toContain('1050 sqft')
    expect(b).toContain('Ready to move')
    expect(b).toContain('Parking, Gym')
  })
  test('omits absent fields instead of inventing them', () => {
    const b = buildPropertyBlock({ id: 'x', title: 'Bare', type: 'sale', price: 5_000_000 })
    expect(b).toContain('*Bare*')
    expect(b).toContain('₹50L')
    expect(b).not.toContain('sqft')        // no size → no size line
    expect(b).not.toContain('🏗️')          // no possession → no line
    expect(b).not.toContain('undefined')
    expect(b).not.toContain('null')
  })
  test('media: markers in features are never shown as amenities', () => {
    expect(buildPropertyBlock(lodha)).not.toContain('media:')
  })
})

test.describe('presentProperties', () => {
  test('single match → singular intro + one block + its photos', () => {
    const r = presentProperties([lodha])
    expect(r.text).toContain('Here’s a property matching your search')
    expect(r.text).toContain('*Lodha*')
    expect(r.shownIds).toEqual(['lodha'])
    expect(r.overflow).toBe(false)
    expect(r.photos.length).toBeGreaterThan(0)
  })

  test('caps at MAX_SHOWN and flags overflow with a call offer', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ ...lodha, id: 'p' + i, title: 'P' + i }))
    const r = presentProperties(many)
    expect(r.shownIds.length).toBe(MAX_SHOWN)
    expect(r.overflow).toBe(true)
    expect(r.text).toContain('would you like a quick call')
  })

  test('exactly 3 matches → no overflow', () => {
    const three = [lodha, { ...lodha, id: 'b' }, { ...lodha, id: 'c' }]
    expect(presentProperties(three).overflow).toBe(false)
  })

  test('empty match → no-match text, no fabricated property', () => {
    const r = presentProperties([])
    expect(r.text).toBe(noMatchText())
    expect(r.shownIds).toEqual([])
    expect(r.photos).toEqual([])
    expect(r.text).not.toMatch(/₹|BHK/)
  })

  test('photos are capped (never floods the customer)', () => {
    const withLotsOfMedia = { ...lodha, property_media: Array.from({ length: 20 }, (_, i) => `https://x/${i}.jpg`) }
    expect(presentProperties([withLotsOfMedia]).photos.length).toBeLessThanOrEqual(4)
  })
})
