import { test, expect } from '@playwright/test'
import { prepareLeadUpdates } from '../../lib/bot/leadUpdates'

test.describe('prepareLeadUpdates', () => {
  test('saves pending visit time without missing database fields', async () => {
    const fakeLLM = async () => '{"ok":true,"iso":"2026-07-05T18:00:00+05:30","language":"hi"}'

    const { leadUpdates, newTime } = await prepareLeadUpdates({
      decision: {
        stage: 'awaiting_email',
        reply: 'Please share your email address so I can send the visit confirmation.',
        action: null,
        updates: { visit_time: 'कल 6 बजे' },
      },
      lead: {},
      message: 'कल 6 बजे',
      currentStage: 'property_shown',
      forcedLang: null,
    }, { llm: fakeLLM as any, now: new Date('2026-07-04T17:15:10.000Z') })

    expect(newTime).toBeTruthy()
    expect(leadUpdates.pending_appointment_time).toBeTruthy()
    expect(leadUpdates.pending_appointment_time).toBe('2026-07-05T12:30:00.000Z')
    expect(leadUpdates.pending_appointment_set_at).toBeTruthy()
    expect(leadUpdates).not.toHaveProperty('confirmation_followup_sent_at')
  })
})
