import { test, expect } from '@playwright/test'
import { buildLeadMemoryContext } from '../../lib/leadMemory'

test.describe('buildLeadMemoryContext', () => {
  test('includes visit outcome, summary, and the last conversation turns so the bot can resume naturally', () => {
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
      bot_paused: false,
      nurture_state: 'active',
    }, { scheduled_at: '2026-06-28T11:00:00+05:30', status: 'upcoming' })

    expect(ctx).toContain('"current_stage": "post_visit"')
    expect(ctx).toContain('"post_visit_result": "interested"')
    expect(ctx).toContain('"summary": "User wants a 3BHK and liked the second flat."')
    expect(ctx).toContain('"existing_appointment"')
    expect(ctx).toContain('"lead_status": "visit_done"')
  })

  test('tracks missing slots and last chat turns for restart prevention', () => {
    const ctx = buildLeadMemoryContext({
      name: 'Rahul',
      status: 'new',
      bot_stage: 'discovery',
    }, null, [
      { role: 'user', text: 'This Sunday at 5 PM', ts: '2026-06-27T10:00:00Z' },
      { role: 'bot', text: 'Please share your email.', ts: '2026-06-27T10:01:00Z' },
    ])

    expect(ctx).toContain('"last_user_message": "This Sunday at 5 PM"')
    expect(ctx).toContain('"last_bot_message": "Please share your email."')
    expect(ctx).toContain('"missing": [')
    expect(ctx).toContain('"intent"')
    expect(ctx).toContain('"email"')
  })
})
