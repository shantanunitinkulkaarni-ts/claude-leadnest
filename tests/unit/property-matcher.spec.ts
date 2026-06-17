import { test, expect } from '@playwright/test'
import { filterPropertiesForLead, isValidMatchedProperty, areaMatches } from '../../lib/propertyMatcher'

test.describe('areaMatches — typo-tolerant locality matching', () => {
  test('exact + substring + case-insensitive', () => {
    expect(areaMatches('Baner, Pune', 'baner')).toBe(true)
    expect(areaMatches('Baner Road, Pune', 'Baner')).toBe(true)
    expect(areaMatches('BANER', 'baner')).toBe(true)
  })
  test('tolerates a single typo / transposition', () => {
    expect(areaMatches('Baner, Pune', 'bnaer')).toBe(true) // transposition
    expect(areaMatches('bnaer, Pune', 'baner')).toBe(true) // typo on the stored side too
    expect(areaMatches('Wakad', 'wakd')).toBe(true)        // missing letter
  })
  test('does NOT match genuinely different localities', () => {
    expect(areaMatches('Baner, Pune', 'wakad')).toBe(false)
    expect(areaMatches('Wakad, Pune', 'baner')).toBe(false)
    expect(areaMatches('Hinjewadi', 'kothrud')).toBe(false)
  })
  test('empty area never matches', () => {
    expect(areaMatches('Baner', '')).toBe(false)
  })
})

test.describe('filterPropertiesForLead — typo-tolerant area filter', () => {
  test('lead area still matches a property whose location was mistyped', () => {
    const mistyped = { id: 'pX', type: 'sale', location: 'Bnaer, Pune', price: 5000000 }
    const result = filterPropertiesForLead([mistyped], { preferred_areas: ['Baner'], budget_max: 6000000 })
    expect(result.map(p => p.id)).toEqual(['pX'])
  })
})

const sale2bhkBaner = { id: 'p1', type: 'sale', location: 'Baner, Pune', price: 8000000 }
const sale4bhkBaner = { id: 'p2', type: 'sale', location: 'Baner, Pune', price: 25000000 }
const rentalBaner = { id: 'p3', type: 'rental', location: 'Baner, Pune', rent_per_month: 30000 }
const saleWakad = { id: 'p4', type: 'sale', location: 'Wakad, Pune', price: 9000000 }

test.describe('filterPropertiesForLead — no criteria yet', () => {
  test('lead with no intent/areas/budget sees full inventory', () => {
    const result = filterPropertiesForLead([sale2bhkBaner, sale4bhkBaner, rentalBaner, saleWakad], {})
    expect(result).toHaveLength(4)
  })
})

test.describe('filterPropertiesForLead — intent filter', () => {
  test('buy intent excludes rentals', () => {
    const result = filterPropertiesForLead([sale2bhkBaner, rentalBaner], { intent: 'buy' })
    expect(result.map(p => p.id)).toEqual(['p1'])
  })

  test('rent intent excludes sales', () => {
    const result = filterPropertiesForLead([sale2bhkBaner, rentalBaner], { intent: 'rent' })
    expect(result.map(p => p.id)).toEqual(['p3'])
  })
})

test.describe('filterPropertiesForLead — area filter', () => {
  test('preferred area excludes non-matching locations', () => {
    const result = filterPropertiesForLead([sale2bhkBaner, saleWakad], { preferred_areas: ['Baner'] })
    expect(result.map(p => p.id)).toEqual(['p1'])
  })

  test('area match is case-insensitive', () => {
    const result = filterPropertiesForLead([sale2bhkBaner], { preferred_areas: ['baner'] })
    expect(result).toHaveLength(1)
  })

  test('multiple preferred areas — any match passes', () => {
    const result = filterPropertiesForLead([sale2bhkBaner, saleWakad], { preferred_areas: ['Wakad', 'Hinjewadi'] })
    expect(result.map(p => p.id)).toEqual(['p4'])
  })
})

test.describe('filterPropertiesForLead — budget filter', () => {
  test('excludes sale property priced far over budget_max', () => {
    const result = filterPropertiesForLead([sale2bhkBaner, sale4bhkBaner], { budget_max: 9000000 })
    expect(result.map(p => p.id)).toEqual(['p1'])
  })

  test('20% tolerance allows slightly-over-budget property', () => {
    // budget_max 7,000,000 * 1.2 = 8,400,000 — p1 at 8,000,000 should pass
    const result = filterPropertiesForLead([sale2bhkBaner], { budget_max: 7000000 })
    expect(result).toHaveLength(1)
  })

  test('excludes property just past the 20% tolerance', () => {
    // budget_max 6,000,000 * 1.2 = 7,200,000 — p1 at 8,000,000 should fail
    const result = filterPropertiesForLead([sale2bhkBaner], { budget_max: 6000000 })
    expect(result).toHaveLength(0)
  })

  test('rental budget checks rent_per_month, not price', () => {
    const result = filterPropertiesForLead([rentalBaner], { budget_max: 25000 })
    // 25000 * 1.2 = 30000 — exactly at threshold, passes
    expect(result).toHaveLength(1)
  })
})

test.describe('filterPropertiesForLead — combined criteria', () => {
  test('intent + area + budget all applied together', () => {
    const result = filterPropertiesForLead(
      [sale2bhkBaner, sale4bhkBaner, rentalBaner, saleWakad],
      { intent: 'buy', preferred_areas: ['Baner'], budget_max: 9000000 }
    )
    expect(result.map(p => p.id)).toEqual(['p1'])
  })

  test('zero matches when nothing fits — returns empty array, not a fallback list', () => {
    const result = filterPropertiesForLead([sale4bhkBaner], { intent: 'buy', budget_max: 5000000 })
    expect(result).toEqual([])
  })
})

test.describe('isValidMatchedProperty', () => {
  const filtered = [sale2bhkBaner, saleWakad]

  test('valid ID within filtered set passes', () => {
    expect(isValidMatchedProperty('p1', filtered)).toBe(true)
  })

  test('ID outside the filtered set fails', () => {
    expect(isValidMatchedProperty('p2', filtered)).toBe(false)
  })

  test('null/undefined ID fails', () => {
    expect(isValidMatchedProperty(null, filtered)).toBe(false)
    expect(isValidMatchedProperty(undefined, filtered)).toBe(false)
  })

  test('empty filtered list always fails', () => {
    expect(isValidMatchedProperty('p1', [])).toBe(false)
  })
})
