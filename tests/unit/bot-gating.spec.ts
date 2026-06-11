import { test, expect } from '@playwright/test'
import { shouldBotReply } from '../../lib/botGating'

/**
 * Scenario tests for the bot's "should I reply?" decision.
 * These lock in the exact behaviour so a future change can't silently make the
 * bot go quiet (or reply when it shouldn't). One case per real-world situation.
 */

const NOW = new Date('2026-06-12T12:00:00Z').getTime()
const PAST = '2026-06-01T00:00:00Z'   // expired
const FUTURE = '2026-12-31T00:00:00Z' // still paid

// A healthy, active agent + lead — the happy path.
const healthy = { bot_active: true, messages_used: 10, messages_limit: 5000, plan_status: 'active', plan_expires_at: FUTURE, lead_bot_paused: false }

test.describe('Bot replies when everything is healthy', () => {
  test('active agent, under limit, lead on auto → replies', () => {
    const r = shouldBotReply(healthy, NOW)
    expect(r.reply).toBe(true)
    expect(r.reason).toBe('ok')
  })

  test('active plan past expiry is NOT blocked (demo/comp protection)', () => {
    const r = shouldBotReply({ ...healthy, plan_status: 'active', plan_expires_at: PAST }, NOW)
    expect(r.reply).toBe(true)
  })

  test('trial still within window → replies', () => {
    const r = shouldBotReply({ ...healthy, plan_status: 'trial', plan_expires_at: FUTURE }, NOW)
    expect(r.reply).toBe(true)
  })
})

test.describe('Bot stays quiet when it should', () => {
  test('agent turned the bot off → no reply (bot_paused)', () => {
    const r = shouldBotReply({ ...healthy, bot_active: false }, NOW)
    expect(r.reply).toBe(false)
    expect(r.reason).toBe('bot_paused')
  })

  test('message limit reached → no reply (limit_reached)', () => {
    const r = shouldBotReply({ ...healthy, messages_used: 5000, messages_limit: 5000 }, NOW)
    expect(r.reply).toBe(false)
    expect(r.reason).toBe('limit_reached')
  })

  test('halted subscription → no reply', () => {
    const r = shouldBotReply({ ...healthy, plan_status: 'halted' }, NOW)
    expect(r.reply).toBe(false)
    expect(r.reason).toBe('subscription_inactive')
  })

  test('expired trial → no reply', () => {
    const r = shouldBotReply({ ...healthy, plan_status: 'trial', plan_expires_at: PAST }, NOW)
    expect(r.reply).toBe(false)
    expect(r.reason).toBe('subscription_inactive')
  })

  test('cancelled + past paid-through → no reply', () => {
    const r = shouldBotReply({ ...healthy, plan_status: 'cancelled', plan_expires_at: PAST }, NOW)
    expect(r.reply).toBe(false)
  })

  test('cancelled but still within paid period → STILL replies', () => {
    const r = shouldBotReply({ ...healthy, plan_status: 'cancelled', plan_expires_at: FUTURE }, NOW)
    expect(r.reply).toBe(true)
  })

  // The exact bug that reached the founder: a lead left in manual mode.
  test('lead in manual mode → no reply (manual_mode)', () => {
    const r = shouldBotReply({ ...healthy, lead_bot_paused: true }, NOW)
    expect(r.reply).toBe(false)
    expect(r.reason).toBe('manual_mode')
  })
})

test.describe('Defensive defaults', () => {
  test('missing plan fields default to active → replies', () => {
    const r = shouldBotReply({ bot_active: true, messages_used: 0, messages_limit: 5000 }, NOW)
    expect(r.reply).toBe(true)
  })
})
