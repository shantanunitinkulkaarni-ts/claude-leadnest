import { test, expect } from '@playwright/test'
import { buildNudgeMemoryContext } from '../../lib/promptEngine'

test.describe('buildNudgeMemoryContext', () => {
  test('includes the visit outcome, summary, and notes for post-visit follow-up', () => {
    const ctx = buildNudgeMemoryContext({
      post_visit_result: 'interested',
      conversation_summary: 'They liked the Baner flat but worried about timing.',
      notes: 'Wants a Saturday slot. Family approval pending.',
    })

    expect(ctx).toContain('Visit outcome: interested')
    expect(ctx).toContain('Conversation summary: They liked the Baner flat but worried about timing.')
    expect(ctx).toContain('Agent notes: Wants a Saturday slot. Family approval pending.')
  })
})
