import { test, expect } from '@playwright/test'
import { decideBotAction, mergeCriteria, QUALIFY_INTENT } from '../../lib/botOrchestrator'
import { defaultIntent, type ExtractedIntent } from '../../lib/intentExtractor'

const intent = (o: Partial<ExtractedIntent>): ExtractedIntent => ({ ...defaultIntent(), ...o })

// The exact live inventory from the hallucination bug.
const inventory = [
  { id: 'lodha', type: 'sale', bhk: '2BHK', location: 'Baner', price: 9_000_000 },
  { id: 'towers', type: 'rental', category: 'Commercial', location: 'Hinjewadi', rent_per_month: 0, price: 90_000 },
]

test.describe('mergeCriteria', () => {
  test('new extracted info overrides stale lead info', () => {
    const c = mergeCriteria({ intent: 'buy', preferred_areas: ['Wakad'] }, intent({ intent: 'rent', areas: ['Baner'] }))
    expect(c.intent).toBe('rent')
    expect(c.preferred_areas).toEqual(['Baner'])
  })
  test('falls back to stored lead info when message adds nothing', () => {
    const c = mergeCriteria({ intent: 'buy', preferred_areas: ['Wakad'], budget_max: 9_000_000 }, intent({}))
    expect(c.intent).toBe('buy')
    expect(c.preferred_areas).toEqual(['Wakad'])
    expect(c.budget_max).toBe(9_000_000)
  })
})

test.describe('decideBotAction — code decides, never fabricates', () => {
  test('🔴 THE BUG: rental in Baner with no such listing → NO MATCH (not invented)', () => {
    const i = intent({ intent: 'rent', areas: ['Baner'], message_type: 'property_request' })
    const c = mergeCriteria({}, i)
    const action = decideBotAction(i, c, inventory)
    expect(action.kind).toBe('no_match') // ← the fabrication is now structurally impossible
  })

  test('buy in Baner (a real sale listing exists) → PRESENT it', () => {
    const i = intent({ intent: 'buy', areas: ['Baner'], message_type: 'property_request' })
    const action = decideBotAction(i, mergeCriteria({}, i), inventory)
    expect(action.kind).toBe('present')
    if (action.kind === 'present') expect(action.properties[0].id).toBe('lodha')
  })

  test('no intent yet → ask buy/rent', () => {
    const a = decideBotAction(intent({ message_type: 'greeting' }), mergeCriteria({}, intent({})), inventory)
    expect(a).toMatchObject({ kind: 'qualify', ask: 'intent' })
  })

  test('intent but no area → ask area', () => {
    const i = intent({ intent: 'buy' })
    const a = decideBotAction(i, mergeCriteria({}, i), inventory)
    expect(a).toMatchObject({ kind: 'qualify', ask: 'area' })
  })

  test('wants a human → hand off', () => {
    expect(decideBotAction(intent({ message_type: 'wants_human' }), mergeCriteria({}, intent({})), inventory).kind).toBe('human')
  })

  test('booking + objection defer to the legacy engine (Phase 2/3)', () => {
    expect(decideBotAction(intent({ message_type: 'booking_request' }), mergeCriteria({}, intent({})), inventory).kind).toBe('fallback')
    expect(decideBotAction(intent({ message_type: 'objection' }), mergeCriteria({}, intent({})), inventory).kind).toBe('fallback')
  })

  test('criteria carried from prior turns still match (stored lead criteria)', () => {
    // Customer only says "Baner" now, but we already knew they want to buy.
    const i = intent({ areas: ['Baner'], message_type: 'qualifying_answer' })
    const c = mergeCriteria({ intent: 'buy' }, i)
    expect(decideBotAction(i, c, inventory).kind).toBe('present')
  })
})
