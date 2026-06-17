import { test, expect } from '@playwright/test'
import { guardReplyFacts, inventoryFactBlob } from '../../lib/factGuard'

// ─── inventoryFactBlob ─────────────────────────────────────────────────────
test.describe('inventoryFactBlob', () => {
  test('concatenates the searchable string fields lowercased', () => {
    const prop = {
      title: 'Sunrise Park',
      location: 'Baner, Pune',
      description: 'Premium 2BHK with 2 covered parking',
      features: ['East-facing', 'Gym', 'Pool', 'media:https://x.com/p.jpg'],
      possession_status: 'ready_to_move',
    }
    const blob = inventoryFactBlob(prop)
    expect(blob).toContain('sunrise park')
    expect(blob).toContain('baner')
    expect(blob).toContain('east-facing')
    expect(blob).toContain('2 covered parking')
    expect(blob).toContain('ready_to_move')
    // media: prefixes are stripped (those are URLs not facts).
    expect(blob).not.toContain('media:')
  })

  test('returns empty string for null/missing property', () => {
    expect(inventoryFactBlob(null)).toBe('')
    expect(inventoryFactBlob(undefined)).toBe('')
    expect(inventoryFactBlob({})).toBe('')
  })
})

// ─── Possession date fabrication ───────────────────────────────────────────
test.describe('guardReplyFacts — possession dates', () => {
  test('passes a reply with no possession date claim', () => {
    const r = guardReplyFacts('Property is ready to move', null)
    expect(r.rewritten).toBe(false)
    expect(r.fabrications).toEqual([])
  })

  test('flags an invented "December 2026" claim when no inventory data', () => {
    const r = guardReplyFacts('Possession is in December 2026', null)
    expect(r.rewritten).toBe(true)
    expect(r.fabrications[0]).toMatch(/possession_date/i)
    expect(r.reply.toLowerCase()).toContain('confirm')
    expect(r.reply.toLowerCase()).not.toContain('december 2026')
  })

  test('flags an invented possession date when matched property has none', () => {
    const prop = { title: 'X', possession_status: 'under_construction' }
    const r = guardReplyFacts('Possession December 2026 expected', prop)
    expect(r.rewritten).toBe(true)
  })

  test('allows a possession date if inventory HAS a possession_date set', () => {
    // The actual stored format doesn't matter — what matters is the inventory
    // has *some* possession_date value, so the LLM's claim is grounded.
    const prop = { title: 'X', possession_status: 'under_construction', possession_date: '2026-12-15' }
    const r = guardReplyFacts('Possession by December 2026', prop)
    expect(r.rewritten).toBe(false)
  })

  test('does NOT flag a bare year (no month) — that is an inventory-style timeframe', () => {
    const r = guardReplyFacts('Possession by 2026', null)
    expect(r.rewritten).toBe(false)
  })
})

// ─── Direction / vastu fabrication ─────────────────────────────────────────
test.describe('guardReplyFacts — direction claims', () => {
  test('flags "east-facing" when no inventory data', () => {
    const r = guardReplyFacts('Yes, it is east-facing', null)
    expect(r.rewritten).toBe(true)
    expect(r.fabrications[0]).toMatch(/direction/i)
  })

  test('allows "east-facing" when inventory features say so', () => {
    const prop = { title: 'X', features: ['East-facing', 'Gym'] }
    const r = guardReplyFacts('Yes, it is east-facing', prop)
    expect(r.rewritten).toBe(false)
  })

  test('flags a wrong direction even when inventory has a different direction', () => {
    const prop = { title: 'X', features: ['East-facing'] }
    const r = guardReplyFacts('Yes, west-facing as you wanted', prop)
    expect(r.rewritten).toBe(true)
  })

  test('does not flag a generic mention of vastu without a direction claim', () => {
    const r = guardReplyFacts('Vastu is important — let me check', null)
    expect(r.rewritten).toBe(false)
  })
})

// ─── Parking fabrication ───────────────────────────────────────────────────
test.describe('guardReplyFacts — parking claims', () => {
  test('flags a SPECIFIC parking claim not in inventory', () => {
    const prop = { title: 'X', description: 'A nice flat with gym' }
    const r = guardReplyFacts('Includes 2 covered parking spots', prop)
    expect(r.rewritten).toBe(true)
    expect(r.fabrications[0]).toMatch(/parking/i)
  })

  test('allows a parking claim that matches inventory description', () => {
    const prop = { title: 'X', description: 'Premium 3BHK with 2 covered parking spots' }
    const r = guardReplyFacts('Yes, 2 covered parking included', prop)
    expect(r.rewritten).toBe(false)
  })

  test('does not flag generic parking mention without numbers', () => {
    // No matched property → parking guard skips entirely (only enforced with prop).
    const r = guardReplyFacts('We will confirm the parking details with the team', null)
    expect(r.rewritten).toBe(false)
  })
})

// ─── Multi-fabrication & idempotency ───────────────────────────────────────
test.describe('guardReplyFacts — combined behavior', () => {
  test('catches multiple fabrications in one reply', () => {
    const prop = { title: 'X', description: 'A flat in Baner' }
    const r = guardReplyFacts(
      'Possession in December 2026, east-facing, 2 covered parking included',
      prop
    )
    expect(r.fabrications.length).toBeGreaterThanOrEqual(2)
    expect(r.rewritten).toBe(true)
  })

  test('a clean reply is returned untouched', () => {
    const prop = {
      title: 'Sunrise Park',
      description: 'Premium 2BHK with 2 covered parking',
      features: ['East-facing', 'Gym'],
    }
    const clean = 'Sure! East-facing as you wanted, 2 covered parking included. Sounds good?'
    const r = guardReplyFacts(clean, prop)
    expect(r.rewritten).toBe(false)
    expect(r.reply).toBe(clean)
  })
})
