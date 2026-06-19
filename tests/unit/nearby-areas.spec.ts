import { test, expect } from '@playwright/test'
import { getNearbyProperties } from '../../lib/propertyMatcher'
import { nearbyIntro, isNearbyIntro } from '../../lib/propertyPresenter'

const crit = (o: any = {}) => ({ intent: 'buy' as const, preferred_areas: ['Baner'], budget_min: null, budget_max: 9_000_000, bhk: null, ...o })
const prop = (id: string, location: string, price = 8_000_000) => ({ id, type: 'sale', location, price })

test.describe('getNearbyProperties — expand to adjacent localities', () => {
  test('finds a property in a neighbouring area (Baner → Aundh)', () => {
    const r = getNearbyProperties([prop('a', 'Aundh, Pune')], crit())
    expect(r).not.toBeNull()
    expect(r!.properties.map(p => p.id)).toEqual(['a'])
    expect(r!.nearbyAreas).toContain('Aundh')
  })

  test('🟠 lists ONLY areas that actually have a match (no over-claiming)', () => {
    // Baner expands to aundh/hinjawadi/wakad/balewadi/pashan, but only Aundh has stock.
    const r = getNearbyProperties([prop('a', 'Aundh, Pune')], crit())
    expect(r!.nearbyAreas).toEqual(['Aundh'])              // not all 5 neighbours
    expect(r!.nearbyAreas).not.toContain('Wakad')
    expect(r!.nearbyAreas).not.toContain('Pashan')
  })

  test('excludes the originally-requested area from the nearby search', () => {
    // A Baner property must NOT come back as a "nearby" result for a Baner search.
    const r = getNearbyProperties([prop('baner1', 'Baner, Pune')], crit())
    expect(r).toBeNull()
  })

  test('respects budget when expanding', () => {
    const r = getNearbyProperties([prop('pricey', 'Aundh', 20_000_000)], crit({ budget_max: 9_000_000 }))
    expect(r).toBeNull() // the Aundh option is over budget+tolerance
  })

  test('null when no preferred areas', () => {
    expect(getNearbyProperties([prop('a', 'Aundh')], crit({ preferred_areas: [] }))).toBeNull()
  })

  test('null when the area has no known neighbours', () => {
    expect(getNearbyProperties([prop('a', 'Nowhere')], crit({ preferred_areas: ['Atlantis'] }))).toBeNull()
  })

  test('multiple matched neighbours are all listed', () => {
    const r = getNearbyProperties([prop('a', 'Aundh'), prop('b', 'Wakad')], crit())
    expect(r!.nearbyAreas.sort()).toEqual(['Aundh', 'Wakad'])
  })
})

test.describe('nearbyIntro + isNearbyIntro — single source of truth (no drift)', () => {
  test('intro names the requested area and the nearby areas', () => {
    const s = nearbyIntro(['Baner'], ['Aundh', 'Wakad'])
    expect(s).toContain('Baner')
    expect(s).toContain('Aundh, Wakad')
  })

  test('isNearbyIntro detects BOTH intro variants', () => {
    expect(isNearbyIntro(nearbyIntro(['Baner'], ['Aundh']))).toBe(true)   // with nearby areas
    expect(isNearbyIntro(nearbyIntro(['Baner'], []))).toBe(true)          // fallback variant
  })

  test('isNearbyIntro is false for normal replies', () => {
    expect(isNearbyIntro('Here’s a property matching your search: ...')).toBe(false)
    expect(isNearbyIntro("I don't have a property matching that exactly right now.")).toBe(false)
    expect(isNearbyIntro(null)).toBe(false)
    expect(isNearbyIntro('')).toBe(false)
  })

  test('ROUND-TRIP guard: any nearbyIntro output is recognised by isNearbyIntro', () => {
    // Pins the coupling — if someone edits the intro wording, this fails loudly
    // instead of silently re-introducing the double-reply bug.
    for (const areas of [['Aundh'], ['Aundh', 'Wakad', 'Balewadi'], []]) {
      expect(isNearbyIntro(nearbyIntro(['Baner'], areas))).toBe(true)
    }
  })
})
