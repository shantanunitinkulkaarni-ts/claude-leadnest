import { test, expect } from '@playwright/test'
import { buildLeadMemoryContext } from '../../lib/leadMemory'

test.describe('buildLeadMemoryContext', () => {
  test('includes visit outcome and conversation summary so the bot can resume naturally', () => {
    const ctx = buildLeadMemoryContext({
      name: 'Asha',
      intent: 'buy',
      preferred_areas: ['Baner'],
      budget_max: 8000000,
      pending_appointment_time: '2026-06-28T11:00:00+05:30',
      email: 'asha@example.com',
      status: 'visit_done',
      temperature: 'warm',
      matched_property_id: 'prop-123',
      post_visit_result: 'interested',
      conversation_summary: 'User wants a 3BHK and liked the second flat.',
      bot_stage: 'post_visit',
    }, { scheduled_at: '2026-06-28T11:00:00+05:30', status: 'upcoming' })

    expect(ctx).toContain('"post_visit_result": "interested"')
    expect(ctx).toContain('"conversation_summary": "User wants a 3BHK and liked the second flat."')
    expect(ctx).toContain('"existing_appointment"')
    expect(ctx).toContain('"status": "visit_done"')
  })
})
