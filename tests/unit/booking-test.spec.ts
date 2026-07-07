import { test, expect } from '@playwright/test'
import {
  buildCancelReply,
  buildReschedulePrompt,
  buildTrollHaltReply,
  buildDoubleBookReply,
  buildMissingDataAlert,
  buildBookingReviewAlert,
  buildSuccessReply,
  shouldAllowReschedule,
  resolveBookingData,
  RESCHEDULE_LIMIT,
} from '../../lib/bot/booking_pure'

const EXISTING_APPT = { id: 'appt-1', scheduled_at: '2026-07-05T11:00:00+05:30', status: 'upcoming', property_id: 'prop-1' }

test.describe('buildCancelReply', () => {
  test('with existing appointment mentions cancellation', () => {
    const reply = buildCancelReply(EXISTING_APPT)
    expect(reply).toContain('cancelled')
    expect(reply).toContain('book a new time')
  })
  test('with no appointment says nothing to cancel', () => {
    const reply = buildCancelReply(null)
    expect(reply).toContain('book one')
  })
})

test.describe('buildReschedulePrompt', () => {
  test('asks for new date and time', () => {
    const reply = buildReschedulePrompt()
    expect(reply).toContain('reschedule')
    expect(reply).toContain('tomorrow 3 PM')
  })
})

test.describe('buildTrollHaltReply', () => {
  test('mentions team will connect personally', () => {
    const reply = buildTrollHaltReply()
    expect(reply).toContain('team will personally connect')
  })
})

test.describe('buildDoubleBookReply', () => {
  test('mentions existing appointment and offers reschedule/cancel', () => {
    const reply = buildDoubleBookReply(EXISTING_APPT)
    expect(reply).toContain('already have a site visit')
    expect(reply).toContain('reschedule')
    expect(reply).toContain('cancel')
  })
})

test.describe('buildMissingDataAlert', () => {
  test('reply says team will reach out', () => {
    const { reply } = buildMissingDataAlert('Rahul', '+9199999', undefined, undefined, undefined)
    expect(reply).toContain('team will reach out')
  })
  test('alert body includes missing fields', () => {
    const { alertBody } = buildMissingDataAlert('Rahul', '+9199999', undefined, undefined, undefined)
    expect(alertBody).toContain('Rahul')
    expect(alertBody).toContain('MISSING')
  })
  test('alert body includes provided values', () => {
    const { alertBody } = buildMissingDataAlert('Asha', '+9188888', 'asha@test.com', '2026-07-05T11:00', 'prop-1')
    expect(alertBody).toContain('asha@test.com')
    expect(alertBody).toContain('prop-1')
  })
})

test.describe('buildBookingReviewAlert', () => {
  test('uses the generic review reply for blocked bookings', () => {
    const { reply, alertBody } = buildBookingReviewAlert({
      leadName: 'Rahul',
      phone: '+9199999',
      email: 'rahul@test.com',
      visitTime: '2026-07-05T11:00',
      propertyTitle: 'Lodha One',
      reason: 'selected property is sold out',
    })
    expect(reply).toContain('received your request')
    expect(alertBody).toContain('sold out')
    expect(alertBody).toContain('Lodha One')
  })
})

test.describe('buildSuccessReply', () => {
  test('with email mentions confirmation email', () => {
    const reply = buildSuccessReply('2026-07-05T11:00:00+05:30', 'asha@test.com', 'Asha')
    expect(reply).toContain('confirmed')
    expect(reply).toContain('confirmation email')
    expect(reply).toContain('Asha')
  })
  test('without email no email mention', () => {
    const reply = buildSuccessReply('2026-07-05T11:00:00+05:30', undefined, 'Asha')
    expect(reply).toContain('confirmed')
    expect(reply).not.toContain('confirmation email')
    expect(reply).toContain('Asha')
  })
})

test.describe('shouldAllowReschedule', () => {
  test('allows when under the limit', () => {
    expect(shouldAllowReschedule(0)).toBe(true)
    expect(shouldAllowReschedule(RESCHEDULE_LIMIT - 1)).toBe(true)
  })
  test('blocks at the limit', () => {
    expect(shouldAllowReschedule(RESCHEDULE_LIMIT)).toBe(false)
    expect(shouldAllowReschedule(RESCHEDULE_LIMIT + 1)).toBe(false)
  })
})

test.describe('resolveBookingData', () => {
  test('uses newTime when provided (highest priority)', () => {
    const result = resolveBookingData('2026-07-10T14:00', { pending_appointment_time: '2026-07-05T11:00', matched_property_id: 'prop-db' }, { pending_appointment_time: '2026-07-01T09:00' }, 'prop-resolved', EXISTING_APPT)
    expect(result.visitTime).toBe('2026-07-10T14:00')
    expect(result.propertyId).toBe('prop-resolved')
  })
  test('falls back to bookingLeadState when no newTime', () => {
    const result = resolveBookingData(undefined, { pending_appointment_time: '2026-07-05T11:00', matched_property_id: 'prop-db' }, { pending_appointment_time: '2026-07-01T09:00' }, null, null)
    expect(result.visitTime).toBe('2026-07-05T11:00')
    expect(result.propertyId).toBe('prop-db')
  })
  test('falls back to lead pending time when bookingLeadState is empty', () => {
    const result = resolveBookingData(undefined, null, { pending_appointment_time: '2026-07-01T09:00' }, null, null)
    expect(result.visitTime).toBe('2026-07-01T09:00')
    expect(result.propertyId).toBeUndefined()
  })
  test('falls back to existingAppointment property_id when nothing else', () => {
    const result = resolveBookingData(undefined, null, {}, null, EXISTING_APPT)
    expect(result.visitTime).toBeUndefined()
    expect(result.propertyId).toBe('prop-1')
  })
  test('all undefined when nothing is available', () => {
    const result = resolveBookingData(undefined, null, {}, null, null)
    expect(result.visitTime).toBeUndefined()
    expect(result.propertyId).toBeUndefined()
  })
})
