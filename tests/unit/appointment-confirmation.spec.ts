import { test, expect } from '@playwright/test'
import { isConfirmationReply, isPendingAppointmentExpired } from '../../lib/appointmentConfirmation'

test.describe('isConfirmationReply — affirmative tokens', () => {
  const positives = [
    'yes', 'Yes!', 'yess', 'yeah', 'yep', 'yup',
    'confirm', 'Confirm', 'confirmed', 'ok', 'okay', 'sure',
    'sounds good', 'works', 'works for me', 'done', 'pakka',
    'haan', 'han', 'theek hai', 'thik hai', 'sahi hai', 'barobar', 'chalega', 'ho',
    'हाँ', 'हां', 'ठीक है', 'ठीक', 'बरोबर', 'चालेल',
    // Added: common Indian affirmatives that were previously missed
    'ji', 'haan ji', 'ji haan', 'bilkul', 'theek', 'thik', 'chalo', 'chala', 'hoy', 'Acknowledged',
    'हो', 'होय', 'जी', 'बरं', 'चला', 'चल',
  ]
  for (const msg of positives) {
    test(`"${msg}" is a confirmation`, () => {
      expect(isConfirmationReply(msg)).toBe(true)
    })
  }
})

test.describe('isConfirmationReply — must not false-positive', () => {
  const negatives = [
    'no, change it to Sunday',
    'not sure, what else do you have?',
    'I am looking for a 2BHK',
    'how much is the EMI?',
    '',
    'maybe later',
  ]
  for (const msg of negatives) {
    test(`"${msg}" is NOT a confirmation`, () => {
      expect(isConfirmationReply(msg)).toBe(false)
    })
  }

  test('"okay but actually..." starting with an affirmative token still matches (caller must gate on pending existing)', () => {
    // This documents the known trade-off: CONFIRM_RE matches on the opening
    // token only. The webhook only ever consults this when a pending
    // appointment exists, so a stray "ok" elsewhere in conversation never
    // books anything by itself.
    expect(isConfirmationReply('okay but actually can we do Monday instead')).toBe(true)
  })
})

test.describe('isPendingAppointmentExpired', () => {
  const HOUR = 60 * 60 * 1000
  const now = Date.parse('2026-06-16T12:00:00Z')

  test('null/undefined setAt is treated as expired', () => {
    expect(isPendingAppointmentExpired(null, now)).toBe(true)
    expect(isPendingAppointmentExpired(undefined, now)).toBe(true)
  })

  test('invalid date string is treated as expired', () => {
    expect(isPendingAppointmentExpired('not-a-date', now)).toBe(true)
  })

  test('within 2 hours is not expired', () => {
    const setAt = new Date(now - 1 * HOUR).toISOString()
    expect(isPendingAppointmentExpired(setAt, now)).toBe(false)
  })

  test('exactly at the 2-hour boundary is not yet expired', () => {
    const setAt = new Date(now - 2 * HOUR).toISOString()
    expect(isPendingAppointmentExpired(setAt, now)).toBe(false)
  })

  test('past 2 hours is expired', () => {
    const setAt = new Date(now - 2 * HOUR - 60 * 1000).toISOString()
    expect(isPendingAppointmentExpired(setAt, now)).toBe(true)
  })
})
