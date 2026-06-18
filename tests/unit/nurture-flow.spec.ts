import { test, expect } from '@playwright/test'
import { decideNurtureStep, withinQuietHours, postWindowSlot, istHour } from '../../lib/nurtureFlow'

const H = 60 * 60 * 1000
const DAY = 24 * H
// Fixed "now" instants chosen by their IST wall-clock hour.
const at = (istH: number) => Date.UTC(2026, 5, 1, ((istH - 5.5) + 24) % 24, istH === 9.5 ? 30 : 0, 0)
const MORNING = Date.UTC(2026, 5, 1, 4, 30, 0)   // 10:00 IST (morning slot, awake)
const AFTERNOON = Date.UTC(2026, 5, 1, 10, 30, 0) // 16:00 IST (afternoon slot)
const MIDDAY = Date.UTC(2026, 5, 1, 7, 30, 0)     // 13:00 IST (awake, NOT a post-window slot)
const NIGHT = Date.UTC(2026, 5, 1, 17, 30, 0)     // 23:00 IST (quiet hours)

test.describe('time helpers', () => {
  test('istHour converts correctly', () => {
    expect(istHour(MORNING)).toBe(10)
    expect(istHour(NIGHT)).toBe(23)
  })
  test('quiet hours: 9am–10pm allowed, else blocked', () => {
    expect(withinQuietHours(MORNING)).toBe(true)
    expect(withinQuietHours(MIDDAY)).toBe(true)
    expect(withinQuietHours(NIGHT)).toBe(false)
  })
  test('post-window slots: morning/afternoon/evening only', () => {
    expect(postWindowSlot(MORNING)).toBe('morning')
    expect(postWindowSlot(AFTERNOON)).toBe('afternoon')
    expect(postWindowSlot(MIDDAY)).toBeNull() // 1pm is awake but not a push slot
  })
})

test.describe('flow halts', () => {
  for (const lead of [
    { tag: 'bot_paused', bot_paused: true },
    { tag: 'opted_out', opted_in: false },
    { tag: 'visit_booked', status: 'visit_booked' },
    { tag: 'closed_won', status: 'closed_won' },
  ]) {
    test(`no send when ${lead.tag}`, () => {
      const r = decideNurtureStep({ last_message_at: new Date(MORNING - 5 * H).toISOString(), ...lead }, {}, MORNING)
      expect(r.send).toBe(false)
    })
  }
})

test.describe('in-window bands (3/6/12/23h)', () => {
  const base = (h: number, count: number, extra: any = {}) =>
    ({ last_message_at: new Date(MORNING - h * H).toISOString(), window_nudge_count: count, status: 'new', opted_in: true, ...extra })

  test('too soon before the 3h band', () => {
    expect(decideNurtureStep(base(2, 0), {}, MORNING).reason).toBe('too_soon')
  })
  test('fires the 3h nudge at 3h+ (count 0)', () => {
    const r = decideNurtureStep(base(3.5, 0), {}, MORNING)
    expect(r).toMatchObject({ send: true, phase: 'in_window', band: 3 })
  })
  test('fires 6h (count 1), 12h (count 2), 23h (count 3)', () => {
    expect(decideNurtureStep(base(6.5, 1), {}, MORNING)).toMatchObject({ send: true, band: 6 })
    expect(decideNurtureStep(base(12.5, 2), {}, MORNING)).toMatchObject({ send: true, band: 12 })
    expect(decideNurtureStep(base(23.5, 3), {}, MORNING)).toMatchObject({ send: true, band: 23 })
  })
  test('exhausted after 4 nudges (still in window)', () => {
    expect(decideNurtureStep(base(23.9, 4), {}, MORNING).reason).toBe('in_window_exhausted')
  })
  test('blocked during quiet hours', () => {
    expect(decideNurtureStep(base(3.5, 0), {}, NIGHT).reason).toBe('quiet_hours')
  })
  test('not two nudges within 2h', () => {
    const lead = base(6.5, 1, { last_nudge_at: new Date(MORNING - 1 * H).toISOString() })
    expect(decideNurtureStep(lead, {}, MORNING).reason).toBe('nudged_recently')
  })
})

test.describe('post-window plans A→B→C→D', () => {
  test('Plan A ~1 day after the window closes', () => {
    const lead = { last_message_at: new Date(MORNING - 25 * H).toISOString(), window_nudge_count: 4, status: 'new', opted_in: true }
    expect(decideNurtureStep(lead, {}, MORNING)).toMatchObject({ send: true, phase: 'post_window', plan: 'A', kind: 'reapproach' })
  })
  test('Plan B 2–3 days after A', () => {
    const lead = { last_message_at: new Date(MORNING - 5 * DAY).toISOString(), nurture_plan: 'A', last_template_at: new Date(MORNING - 3 * DAY).toISOString(), status: 'new', opted_in: true }
    expect(decideNurtureStep(lead, {}, MORNING)).toMatchObject({ send: true, plan: 'B', kind: 'open_question' })
  })
  test('Plan C 5–7 days after B', () => {
    const lead = { last_message_at: new Date(MORNING - 12 * DAY).toISOString(), nurture_plan: 'B', last_template_at: new Date(MORNING - 6 * DAY).toISOString(), status: 'new', opted_in: true }
    expect(decideNurtureStep(lead, {}, MORNING)).toMatchObject({ send: true, plan: 'C', kind: 'offer' })
  })
  test('Plan D 10–12 days after C', () => {
    const lead = { last_message_at: new Date(MORNING - 25 * DAY).toISOString(), nurture_plan: 'C', last_template_at: new Date(MORNING - 11 * DAY).toISOString(), status: 'new', opted_in: true }
    expect(decideNurtureStep(lead, {}, MORNING)).toMatchObject({ send: true, plan: 'D', kind: 'routine' })
  })
  test('Plan D repeats: ~6-day gap early, 4-day gap once steady', () => {
    const early = { last_message_at: new Date(MORNING - 40 * DAY).toISOString(), nurture_plan: 'D', plan_d_touches: 1, last_template_at: new Date(MORNING - 6 * DAY).toISOString(), status: 'new', opted_in: true }
    expect(decideNurtureStep(early, {}, MORNING)).toMatchObject({ send: true, plan: 'D' })
    const steady = { last_message_at: new Date(MORNING - 60 * DAY).toISOString(), nurture_plan: 'D', plan_d_touches: 3, last_template_at: new Date(MORNING - 4 * DAY).toISOString(), status: 'new', opted_in: true }
    expect(decideNurtureStep(steady, {}, MORNING)).toMatchObject({ send: true, plan: 'D' })
    const tooSoon = { last_message_at: new Date(MORNING - 60 * DAY).toISOString(), nurture_plan: 'D', plan_d_touches: 3, last_template_at: new Date(MORNING - 3 * DAY).toISOString(), status: 'new', opted_in: true }
    expect(decideNurtureStep(tooSoon, {}, MORNING).send).toBe(false)
  })
  test('holds when the gap is not yet reached', () => {
    const lead = { last_message_at: new Date(MORNING - 30 * H).toISOString(), nurture_plan: 'A', last_template_at: new Date(MORNING - 1 * DAY).toISOString(), status: 'new', opted_in: true }
    expect(decideNurtureStep(lead, {}, MORNING).send).toBe(false) // B needs ~2.5d
  })
  test('holds outside the preferred send windows even if due', () => {
    const lead = { last_message_at: new Date(MIDDAY - 25 * H).toISOString(), window_nudge_count: 4, status: 'new', opted_in: true }
    expect(decideNurtureStep(lead, {}, MIDDAY).reason).toBe('outside_send_window')
  })
})
