import { test, expect } from '@playwright/test'
import { buildConfirmationFollowupMessage, shouldSendConfirmationFollowup } from '../../lib/confirmationFollowup'

test.describe('shouldSendConfirmationFollowup', () => {
  const now = Date.parse('2026-06-28T12:00:00Z')

  test('waits until the lead has been sitting on a pending visit long enough', () => {
    const lead = {
      pending_appointment_time: '2026-06-29T11:00:00+05:30',
      pending_appointment_set_at: new Date(now - 30 * 60 * 1000).toISOString(),
    }
    expect(shouldSendConfirmationFollowup(lead, now).send).toBe(false)
  })

  test('sends one reminder after the delay when nothing has been confirmed', () => {
    const lead = {
      name: 'Rahul',
      pending_appointment_time: '2026-06-29T11:00:00+05:30',
      pending_appointment_set_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    }
    expect(shouldSendConfirmationFollowup(lead, now)).toMatchObject({ send: true, reason: 'followup_due' })
  })

  test('does not send again once the follow-up has already gone out', () => {
    const lead = {
      pending_appointment_time: '2026-06-29T11:00:00+05:30',
      pending_appointment_set_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      confirmation_followup_sent_at: new Date(now - 10 * 60 * 1000).toISOString(),
    }
    expect(shouldSendConfirmationFollowup(lead, now).send).toBe(false)
  })
})

test.describe('buildConfirmationFollowupMessage', () => {
  test('keeps the message short and clear', () => {
    const text = buildConfirmationFollowupMessage(
      { name: 'Rahul' },
      '2026-06-29T11:00:00+05:30',
      'Lodha One'
    )
    expect(text).toContain('Rahul')
    expect(text).toContain('Lodha One')
    expect(text).toContain('Confirm')
  })
})
