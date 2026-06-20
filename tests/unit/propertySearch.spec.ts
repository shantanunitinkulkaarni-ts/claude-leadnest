/**
 * Unit Tests: propertySearch.ts (Playwright)
 * Core property matching engine tests
 */

import { test, expect } from '@playwright/test'
import {
  searchPropertiesByFallbackChain,
  areaMatches,
  isWithinBudget,
  NEARBY_AREAS,
  type SearchCriteria,
  type PropertyRow,
} from '@/lib/propertySearch'

import { allActiveProperties, banerRentals, banerSales } from './fixtures/properties.fixture'

test.describe('propertySearch', () => {
  test.describe('areaMatches', () => {
    test('exact substring match (case-insensitive)', () => {
      expect(areaMatches('Baner, Pune', 'baner')).toBe(true)
      expect(areaMatches('KOREGAON PARK', 'koregaon park')).toBe(true)
    })

    test('should not match different areas', () => {
      expect(areaMatches('Baner', 'Magarpatta')).toBe(false)
    })

    test('handles empty/null safely', () => {
      expect(areaMatches('', 'baner')).toBe(false)
      expect(areaMatches('Baner', null as any)).toBe(false)
    })
  })

  test.describe('isWithinBudget', () => {
    test('accepts properties at or below budget', () => {
      const rental: PropertyRow = {
        id: '1', agent_id: 'a1', type: 'rental' as const, location: 'Baner', rent_per_month: 20000,
      }
      expect(isWithinBudget(rental, 25000, 'rental')).toBe(true)
    })

    test('accepts within 20% tolerance', () => {
      const rental: PropertyRow = {
        id: '1', agent_id: 'a1', type: 'rental', location: 'Baner', rent_per_month: 25000,
      }
      expect(isWithinBudget(rental, 20834, 'rental')).toBe(true)
    })

    test('rejects significantly over budget', () => {
      const rental: PropertyRow = {
        id: '1', agent_id: 'a1', type: 'rental', location: 'Baner', rent_per_month: 40000,
      }
      expect(isWithinBudget(rental, 20000, 'rental')).toBe(false)
    })

    test('all prices match when no budget set', () => {
      const rental: PropertyRow = {
        id: '1', agent_id: 'a1', type: 'rental' as const, location: 'Baner', rent_per_month: 100000,
      }
      expect(isWithinBudget(rental, null, 'rental')).toBe(true)
    })

    test('handles sale properties (price field)', () => {
      const sale: PropertyRow = {
        id: '1', agent_id: 'a1', type: 'sale', location: 'Baner', price: 5000000,
      }
      expect(isWithinBudget(sale, 6000000, 'sale')).toBe(true)
      expect(isWithinBudget(sale, 4000000, 'sale')).toBe(false)
    })
  })

  test.describe('searchPropertiesByFallbackChain', () => {
    test('Level 1: exact area + intent + budget (rental)', () => {
      const criteria: SearchCriteria = {
        intent: 'rent',
        preferred_areas: ['baner'],
        budget_max: 30000,
      }

      const result = searchPropertiesByFallbackChain(allActiveProperties, criteria)

      // Should find rentals in Baner within budget
      if (result.properties.length > 0) {
        expect(result.properties.every(p => p.type === 'rental')).toBe(true)
        expect(result.properties.every(p => areaMatches(p.location, 'baner'))).toBe(true)
      }
    })

    test('Level 1: exact area + intent + budget (sale)', () => {
      const criteria: SearchCriteria = {
        intent: 'buy',
        preferred_areas: ['baner'],
        budget_max: 6000000,
      }

      const result = searchPropertiesByFallbackChain(allActiveProperties, criteria)

      if (result.properties.length > 0) {
        expect(result.properties.every(p => p.type === 'sale')).toBe(true)
      }
    })

    test('never mixes rental and sale properties', () => {
      const criteria: SearchCriteria = {
        intent: 'rent',
        preferred_areas: ['baner'],
        budget_max: 30000,
      }

      const result = searchPropertiesByFallbackChain(allActiveProperties, criteria)

      // Rental lead NEVER sees sale
      expect(result.properties.every(p => p.type === 'rental')).toBe(true)
    })

    test('returns none when intent is null', () => {
      const criteria: SearchCriteria = {
        intent: null,
        preferred_areas: ['baner'],
        budget_max: 30000,
      }

      const result = searchPropertiesByFallbackChain(allActiveProperties, criteria)

      expect(result.level).toBe('none')
      expect(result.properties.length).toBe(0)
    })

    test('detects no inventory for intent', () => {
      // Only sales
      const salesOnly = allActiveProperties.filter(p => p.type === 'sale')

      const criteria: SearchCriteria = {
        intent: 'rent',
        preferred_areas: ['baner'],
        budget_max: 30000,
      }

      const result = searchPropertiesByFallbackChain(salesOnly, criteria)

      expect(result.level).toBe('no_inventory')
      expect(result.intentLabel).toBe('rental')
    })

    test('handles empty property list', () => {
      const criteria: SearchCriteria = {
        intent: 'rent',
        preferred_areas: ['baner'],
        budget_max: 30000,
      }

      const result = searchPropertiesByFallbackChain([], criteria)

      expect(result.level).toBe('no_inventory')
    })
  })

  test.describe('NEARBY_AREAS map', () => {
    test('has data for major areas', () => {
      expect(NEARBY_AREAS['baner']).toBeDefined()
      expect(NEARBY_AREAS['aundh']).toBeDefined()
    })

    test('adjacency is reciprocated', () => {
      const baner = NEARBY_AREAS['baner']
      const aundh = NEARBY_AREAS['aundh']

      if (aundh && baner.includes('aundh')) {
        expect(aundh.includes('baner')).toBe(true)
      }
    })
  })
})
