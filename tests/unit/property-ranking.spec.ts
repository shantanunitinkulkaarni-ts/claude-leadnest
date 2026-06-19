import { test, expect } from '@playwright/test'
import { rankPropertiesForLead } from '../../lib/propertyMatcher'

const mk = (id: string, o: any = {}) => ({ id, type: 'sale', location: 'Baner', ...o })

test.describe('rankPropertiesForLead — deterministic best-fit-first', () => {
  test('within-budget options rank above over-budget ones', () => {
    const within = mk('within', { price: 8_000_000 })
    const over = mk('over', { price: 11_000_000 }) // within 1.2x tolerance but over budget
    const r = rankPropertiesForLead([over, within], { budget_max: 9_000_000, preferred_areas: ['Baner'] })
    expect(r[0].id).toBe('within')
  })

  test('among within-budget, the one using more of the budget ranks first', () => {
    const cheap = mk('cheap', { price: 4_000_000 })
    const near = mk('near', { price: 8_800_000 })
    const r = rankPropertiesForLead([cheap, near], { budget_max: 9_000_000, preferred_areas: ['Baner'] })
    expect(r[0].id).toBe('near')
  })

  test('exact area match beats a different area', () => {
    const baner = mk('baner', { price: 8_000_000, location: 'Baner, Pune' })
    const wakad = mk('wakad', { price: 8_000_000, location: 'Wakad, Pune' })
    const r = rankPropertiesForLead([wakad, baner], { budget_max: 9_000_000, preferred_areas: ['Baner'] })
    expect(r[0].id).toBe('baner')
  })

  test('BHK match gives a bump when desired BHK is known', () => {
    const twobhk = mk('2bhk', { price: 8_000_000, bhk: '2BHK' })
    const threebhk = mk('3bhk', { price: 8_000_000, bhk: '3BHK' })
    const r = rankPropertiesForLead([threebhk, twobhk], { budget_max: 9_000_000, preferred_areas: ['Baner'], bhk: '2BHK' })
    expect(r[0].id).toBe('2bhk')
  })

  test('does not mutate the input array', () => {
    const input = [mk('a', { price: 1 }), mk('b', { price: 2 })]
    const copy = [...input]
    rankPropertiesForLead(input, { budget_max: 9_000_000 })
    expect(input).toEqual(copy)
  })

  test('handles empty / missing criteria gracefully', () => {
    expect(rankPropertiesForLead([], {})).toEqual([])
    expect(rankPropertiesForLead([mk('a')], {}).length).toBe(1)
  })
})
