/**
 * Unit Tests: leadCriteria.ts (Playwright)
 * Criteria extraction and merging tests
 */

import { test, expect } from '@playwright/test'
import {
  extractIntent,
  extractArea,
  extractBudget,
  extractBHK,
  extractAllCriteria,
  mergeCriteria,
  getLeadUpdates,
  type MergedCriteria,
  type ExtractedCriteria,
} from '@/lib/leadCriteria'

test.describe('leadCriteria', () => {
  test.describe('extractIntent', () => {
    test('extracts buy signals', () => {
      expect(extractIntent('I want to buy')).toBe('buy')
      expect(extractIntent('looking to purchase')).toBe('buy')
      expect(extractIntent('buy property')).toBe('buy')
    })

    test('extracts rent signals', () => {
      expect(extractIntent('I want to rent')).toBe('rent')
      expect(extractIntent('looking for rental')).toBe('rent')
      expect(extractIntent('kiraya chahiye')).toBe('rent')
    })

    test('returns null for ambiguous messages', () => {
      expect(extractIntent('Show me properties')).toBe(null)
      expect(extractIntent('What is your number?')).toBe(null)
    })

    test('case insensitive', () => {
      expect(extractIntent('I WANT TO BUY')).toBe('buy')
    })

    test('handles empty input', () => {
      expect(extractIntent('')).toBe(null)
    })
  })

  test.describe('extractArea', () => {
    test('extracts area after preposition', () => {
      expect(extractArea('in Baner')).toBe('baner')
      expect(extractArea('at Koregaon Park')).toBe('koregaon park')
      expect(extractArea('mein Aundh')).toBe('aundh')
    })

    test('extracts standalone area name', () => {
      expect(extractArea('Baner')).toBe('baner')
      expect(extractArea('aundh')).toBe('aundh')
    })

    test('returns null for too-short input', () => {
      expect(extractArea('ab')).toBe(null) // Too short
      expect(extractArea('a')).toBe(null)
    })

    test('handles multi-word areas', () => {
      expect(extractArea('in Koregaon Park')).toBe('koregaon park')
      expect(extractArea('at Viman Nagar')).toBe('viman nagar')
    })
  })

  test.describe('extractBudget', () => {
    test('extracts k (thousands)', () => {
      expect(extractBudget('30k')).toBe(30000)
      expect(extractBudget('50K')).toBe(50000)
    })

    test('extracts l (lakhs)', () => {
      expect(extractBudget('50l')).toBe(5000000)
      expect(extractBudget('50 lakh')).toBe(5000000)
    })

    test('extracts cr (crores)', () => {
      expect(extractBudget('1cr')).toBe(10000000)
      expect(extractBudget('1 crore')).toBe(10000000)
      expect(extractBudget('2cr')).toBe(20000000)
    })

    test('extracts plain numbers', () => {
      expect(extractBudget('25000')).toBe(25000)
      expect(extractBudget('1000000')).toBe(1000000)
    })

    test('returns null for non-numeric', () => {
      expect(extractBudget('no budget')).toBe(null)
    })

    test('ignores very short numbers', () => {
      expect(extractBudget('100')).toBe(null)
    })
  })

  test.describe('extractBHK', () => {
    test('extracts BHK values', () => {
      expect(extractBHK('2BHK')).toBe('2bhk')
      expect(extractBHK('3 BHK')).toBe('3bhk')
      expect(extractBHK('1bhk')).toBe('1bhk')
    })

    test('returns null when no BHK', () => {
      expect(extractBHK('apartment')).toBe(null)
      expect(extractBHK('property')).toBe(null)
    })
  })

  test.describe('mergeCriteria', () => {
    test('newer intent overrides stored', () => {
      const stored: Partial<MergedCriteria> = { intent: 'buy' }
      const extracted: ExtractedCriteria = {
        intent: 'rent',
        areas: null,
        budget_max: null,
        budget_min: null,
        bhk: null,
      }

      const result = mergeCriteria(stored, extracted)

      expect(result.intent).toBe('rent')
    })

    test('preserves stored when nothing new extracted', () => {
      const stored: Partial<MergedCriteria> = {
        intent: 'rent',
        preferred_areas: ['baner'],
        budget_max: 30000,
      }
      const extracted: ExtractedCriteria = {
        intent: null,
        areas: null,
        budget_max: null,
        budget_min: null,
        bhk: null,
      }

      const result = mergeCriteria(stored, extracted)

      expect(result.intent).toBe('rent')
      expect(result.preferred_areas).toEqual(['baner'])
      expect(result.budget_max).toBe(30000)
    })

    test('defaults to null/[] when no data', () => {
      const stored: Partial<MergedCriteria> = {}
      const extracted: ExtractedCriteria = {
        intent: null,
        areas: null,
        budget_max: null,
        budget_min: null,
        bhk: null,
      }

      const result = mergeCriteria(stored, extracted)

      expect(result.intent).toBe(null)
      expect(result.preferred_areas).toEqual([])
      expect(result.budget_max).toBe(null)
    })

    test('updates budget to higher value', () => {
      const stored: Partial<MergedCriteria> = { budget_max: 30000 }
      const extracted: ExtractedCriteria = {
        intent: null,
        areas: null,
        budget_max: 50000,
        budget_min: null,
        bhk: null,
      }

      const result = mergeCriteria(stored, extracted)

      expect(result.budget_max).toBe(50000)
    })
  })

  test.describe('extractAllCriteria', () => {
    test('extracts all fields from message', () => {
      const result = extractAllCriteria('I want to rent a 2BHK in Baner for 25k')

      expect(result.intent).toBe('rent')
      expect(result.areas).toContain('baner')
      expect(result.bhk).toBe('2bhk')
      expect(result.budget_max).toBe(25000)
    })

    test('handles mixed language input', () => {
      const result = extractAllCriteria('I want to rent a 2BHK in Baner 25k')

      expect(result.intent).toBe('rent')
      expect(result.areas).not.toBe(null)
      expect(result.bhk).toBe('2bhk')
      expect(result.budget_max).toBe(25000)
    })

    test('handles incomplete messages', () => {
      const result = extractAllCriteria('Show me properties')

      expect(result.intent).toBe(null)
      expect(result.areas).toBe(null)
    })
  })

  test.describe('getLeadUpdates', () => {
    test('returns empty when nothing changed', () => {
      const lead: Partial<MergedCriteria> = {
        intent: 'rent',
        preferred_areas: ['baner'],
      }

      const updates = getLeadUpdates(lead, 'Show me more properties')

      expect(Object.keys(updates).length).toBe(0)
    })

    test('includes only changed fields', () => {
      const lead: Partial<MergedCriteria> = {
        intent: 'buy',
        preferred_areas: ['koregaon park'],
        budget_max: 50000000,
      }

      const updates = getLeadUpdates(lead, 'Actually, I want to rent in Baner for 30k')

      expect(updates.intent).toBe('rent')
      expect(updates.preferred_areas).toEqual(['baner'])
      expect(updates.budget_max).toBe(30000)
    })

    test('handles new lead', () => {
      const lead: Partial<MergedCriteria> = {
        intent: null,
        preferred_areas: [],
        budget_max: null,
      }

      const updates = getLeadUpdates(lead, 'I want to buy in Koregaon Park')

      expect(updates.intent).toBe('buy')
      expect(updates.preferred_areas).toEqual(['koregaon park'])
    })
  })

  test.describe('Edge cases', () => {
    test('handles special characters', () => {
      const msg = 'I want to rent a 2BHK in Baner 30k max!'

      const result = extractAllCriteria(msg)

      expect(result.intent).toBe('rent')
      expect(result.areas).not.toBe(null)
      expect(result.bhk).toBe('2bhk')
      expect(result.budget_max).toBe(30000)
    })

    test('handles duplicate info', () => {
      const msg = 'I want to rent rent a 2BHK 2BHK in Baner 30k 30k'

      const result = extractAllCriteria(msg)

      expect(result.intent).toBe('rent')
      expect(result.bhk).toBe('2bhk')
      expect(result.budget_max).toBe(30000)
    })

    test('handles empty input gracefully', () => {
      const result = extractAllCriteria('')

      expect(result.intent).toBe(null)
      expect(result.areas).toBe(null)
    })
  })
})
