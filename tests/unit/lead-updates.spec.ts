import { test, expect } from '@playwright/test'
import { prepareLeadUpdates } from '../../lib/bot/leadUpdates'

test.describe('prepareLeadUpdates', () => {
  test('saves pending visit time without missing database fields', () => {
    const realNow = Date.now
    Date.now = () => Date.parse('2026-07-04T17:15:10.000Z')
    try {
      const { leadUpdates, newTime } = prepareLeadUpdates({
        decision: {
          stage: 'awaiting_email',
          reply: 'Please share your email address so I can send the visit confirmation.',
          action: null,
          updates: { visit_time: 'tomorrow at 6pm' },
        },
        lead: {},
        message: 'tomorrow at 6pm',
        currentStage: 'property_shown',
        forcedLang: null,
      })

      expect(newTime).toBeTruthy()
      expect(leadUpdates.pending_appointment_time).toBeTruthy()
      expect(leadUpdates.pending_appointment_set_at).toBeTruthy()
      expect(leadUpdates).not.toHaveProperty('confirmation_followup_sent_at')
    } finally {
      Date.now = realNow
    }
  })
})
