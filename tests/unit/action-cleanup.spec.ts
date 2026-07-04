import { test, expect } from '@playwright/test'
import { cleanBookingAction } from '../../lib/bot/actionCleanup'

test.describe('cleanBookingAction', () => {
  test('email after a saved visit time triggers booking', () => {
    const decision: any = {
      stage: 'awaiting_email',
      reply: 'Thanks. I am booking the site visit now.',
      action: null,
      updates: { email: 'me@example.com' },
    }

    cleanBookingAction({
      decision,
      lead: { pending_appointment_time: '2026-07-05T12:30:00.000Z' },
      leadUpdates: { email: 'me@example.com' },
      existingAppointment: null,
      proposedEmail: 'me@example.com',
      emailIsValid: true,
      finalReply: decision.reply,
    })

    expect(decision.action).toBe('book_visit')
  })
})
