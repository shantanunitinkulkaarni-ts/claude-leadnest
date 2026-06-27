import { test, expect } from '@playwright/test'
import { resolveAppointmentTime, formatIST } from '../../lib/appointment'

// Read the IST wall-clock (hour/min/day) of a stored UTC ISO instant —
// timezone-independent (works regardless of the machine running the test).
function ist(iso: string) {
  const d = new Date(new Date(iso).getTime() + 5.5 * 60 * 60 * 1000)
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() }
}

// Fixed "now" = 2026-06-14 18:58 IST (13:28 UTC) — the exact moment the live bug
// booked "6:58 PM" via the now+24h fallback. Bug-for-bug reproduction baseline.
const NOW = Date.parse('2026-06-14T13:28:00Z')

test.describe('resolveAppointmentTime', () => {
  test('THE BUG: garbage llm time + reply "tomorrow at 11:30 AM" → 11:30 IST tomorrow, NOT now+24h', () => {
    const r = resolveAppointmentTime({
      llmTime: 'sometime tomorrow', // unparseable as a real time
      replyText: "Great! I've booked your visit for tomorrow at 11:30 AM. See you then! 🏠",
      nowMs: NOW,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const w = ist(r.iso)
    expect({ h: w.h, mi: w.mi }).toEqual({ h: 11, mi: 30 }) // 11:30, not 18:58
    expect(w.d).toBe(15) // tomorrow
    // Explicitly assert it is NOT the old now+24h fabrication (would be 18:58).
    expect(new Date(r.iso).getTime()).not.toBe(NOW + 24 * 60 * 60 * 1000)
  })

  test('clean ISO with +05:30 offset → IST wall-clock preserved', () => {
    const r = resolveAppointmentTime({ llmTime: '2026-06-15T11:30:00+05:30', replyText: '', nowMs: NOW })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.iso).toBe('2026-06-15T06:00:00.000Z')
    expect(ist(r.iso)).toMatchObject({ h: 11, mi: 30 })
  })

  test('ISO with NO timezone → treated as IST (not UTC) — fixes the 5.5h shift', () => {
    const r = resolveAppointmentTime({ llmTime: '2026-06-15T11:30:00', replyText: '', nowMs: NOW })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // If it were (wrongly) parsed as UTC, IST would read 17:00. We want 11:30.
    expect(ist(r.iso)).toMatchObject({ h: 11, mi: 30 })
  })

  test('wall-clock is always treated as IST even with a stray Z', () => {
    const r = resolveAppointmentTime({ llmTime: '2026-06-15T11:30:00Z', replyText: '', nowMs: NOW })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(ist(r.iso)).toMatchObject({ h: 11, mi: 30 }) // not shifted by the Z
  })

  test('natural-language llm time ("tomorrow at 5 pm")', () => {
    const r = resolveAppointmentTime({ llmTime: 'tomorrow at 5 pm', replyText: '', nowMs: NOW })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(ist(r.iso)).toMatchObject({ h: 17, mi: 0, d: 15 })
  })

  test('reply restates time when llm field omitted entirely', () => {
    const r = resolveAppointmentTime({
      llmTime: null,
      replyText: 'Perfect, see you Saturday at 4:30 PM!',
      nowMs: NOW,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(ist(r.iso)).toMatchObject({ h: 16, mi: 30 })
  })

  test('reply text wins when the model guesses the wrong date', () => {
    const r = resolveAppointmentTime({
      llmTime: '2026-06-29T17:00:00+05:30',
      replyText: 'This Sunday at 5 PM',
      nowMs: Date.parse('2026-06-27T12:00:00Z'),
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const w = ist(r.iso)
    expect(w).toMatchObject({ d: 28, h: 17, mi: 0 })
  })

  test('past time is rejected (never books history)', () => {
    const r = resolveAppointmentTime({ llmTime: '2020-01-01T11:30:00', replyText: '', nowMs: NOW })
    expect(r.ok).toBe(false)
  })

  test('absurdly far time (>90 days) is rejected', () => {
    const r = resolveAppointmentTime({ llmTime: '2027-06-15T11:30:00', replyText: '', nowMs: NOW })
    expect(r.ok).toBe(false)
  })

  test('no explicit time anywhere → ok:false (caller must ask, not fabricate)', () => {
    const r = resolveAppointmentTime({ llmTime: null, replyText: 'Sounds good, talk soon!', nowMs: NOW })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toContain('no explicit time')
  })

  test('date-only with no time is NOT turned into a booking', () => {
    const r = resolveAppointmentTime({ llmTime: null, replyText: "Let's meet tomorrow then!", nowMs: NOW })
    expect(r.ok).toBe(false)
  })

  test('empty/garbage inputs never throw and return ok:false', () => {
    expect(resolveAppointmentTime({ nowMs: NOW }).ok).toBe(false)
    expect(resolveAppointmentTime({ llmTime: '', replyText: '', nowMs: NOW }).ok).toBe(false)
    expect(resolveAppointmentTime({ llmTime: '!!!', replyText: '???', nowMs: NOW }).ok).toBe(false)
  })
})

test.describe('formatIST', () => {
  test('renders a UTC instant in IST wall-clock', () => {
    // 06:00Z == 11:30 IST
    expect(formatIST('2026-06-15T06:00:00.000Z')).toMatch(/11:30/)
  })
  test('passes through an invalid string unchanged', () => {
    expect(formatIST('not-a-date')).toBe('not-a-date')
  })
})
