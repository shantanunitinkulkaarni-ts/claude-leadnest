import { test, expect } from '@playwright/test'
import { buildPropertyBlock, presentProperties, priceText, noMatchText, MAX_SHOWN } from '../../lib/propertyPresenter'

// Real production inventory shape (the agency from the live hallucination bug).
const lodha = {
  id: 'lodha',
  title: 'Lodha',
  type: 'sale',
  bhk: '2BHK',
  category: 'Apartment',
  location: 'Baner',
  city: 'Pune',
  price: 9_000_000,
  size_sqft: 1050,
  possession_status: 'ready_to_move',
  floor_plan_available: true,
  booking_started: false,
  finance_options: 'Home loan available',
  area_ranking: 'premium',
  purchase_indicator: 5,
  parking_available: true,
  parking_details: 'Covered parking available',
  broker_recommendation: 'Strong buy. Premium area. Good for end use.',
  features: ['Parking', 'Gym', 'media:https://x/1.jpg'],
  property_media: ['https://x/1.jpg', 'https://x/2.jpg'],
}
const launch = {
  id: 'launch',
  title: 'Sky Launch',
  type: 'sale',
  bhk: '3BHK',
  location: 'Baner',
  city: 'Pune',
  price: 12_500_000,
  possession_status: 'new_launch',
  booking_started: false,
  floor_plan_available: true,
  area_ranking: 'premium',
  purchase_indicator: 4,
  parking_available: true,
  finance_options: 'Home loan available',
  broker_recommendation: 'Decent buy. Premium locality. Worth shortlisting.',
}
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
  test('shows title, bhk, location, exact price, size, possession, amenities, and broker details', () => {
    const b = buildPropertyBlock(lodha)
    expect(b).toContain('Property - Lodha')
    expect(b).toContain('2BHK')
    expect(b).toContain('Location - Baner')
    expect(b).toContain('Price - ₹90L')
    expect(b).toContain('Area - 1050 sqft')
    expect(b).toContain('Possession - Ready to move')
    expect(b).toContain('Status - Ready to move')
    expect(b).toContain('Floor plan - Yes')
    expect(b).toContain('Finance options - Home loan available')
    expect(b).toContain('Area ranking - Premium area')
    expect(b).toContain('Purchase indicator - 5/5')
    expect(b).toContain('Parking - Covered parking available')
    expect(b).toContain('Recommendation - Strong buy. Premium area. Good for end use.')
    expect(b).toContain('Amenities - This property has amenities such as Parking, Gym')
  })
  test('omits absent fields instead of inventing them', () => {
    const b = buildPropertyBlock({ id: 'x', title: 'Bare', type: 'sale', price: 5_000_000 })
    expect(b).toContain('Property - Bare')
    expect(b).toContain('Price - ₹50L')
    expect(b).not.toContain('sqft')        // no size → no size line
    expect(b).not.toContain('Possession -')
    expect(b).not.toContain('undefined')
    expect(b).not.toContain('null')
  })
  test('media: markers in features are never shown as amenities', () => {
    expect(buildPropertyBlock(lodha)).not.toContain('media:')
  })

  test('new construction properties mention booking status clearly', () => {
    const b = buildPropertyBlock(launch)
    expect(b).toContain('Possession - New construction')
    expect(b).toContain('Status - New construction')
    expect(b).toContain('Booking status - Booking has not begun yet')
  })
})

test.describe('presentProperties', () => {
  test('single match → singular intro + one block + its photos', () => {
    const r = presentProperties([lodha])
    expect(r.text).toContain('Here’s a property matching your search')
    expect(r.text).toContain('Property - Lodha')
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
