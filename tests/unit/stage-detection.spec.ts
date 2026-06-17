import { test, expect } from '@playwright/test'
import { detectStage } from '../../lib/stageMachine'

/**
 * Stage machine tests — covers every transition rule documented in
 * lib/stageMachine.ts, in priority order. Locks in name-capture-first and
 * prevents regressions in stage routing.
 */

test.describe('priority 1 — closed (terminal)', () => {
  test('closed_won → closed', () => {
    expect(detectStage({ status: 'closed_won', name: 'Rahul' }, 10)).toBe('closed')
  })

  test('closed_lost → closed', () => {
    expect(detectStage({ status: 'closed_lost', name: 'Rahul' }, 10)).toBe('closed')
  })

  test('closed overrides post_visit_result', () => {
    expect(detectStage({ status: 'closed_won', post_visit_result: 'interested' }, 10)).toBe('closed')
  })
})

test.describe('priority 2 — post_visit', () => {
  test('status visit_done → post_visit', () => {
    expect(detectStage({ name: 'Rahul', status: 'visit_done', intent: 'buy', preferred_areas: ['Baner'] }, 8)).toBe('post_visit')
  })

  test('post_visit_result set → post_visit even on first message', () => {
    expect(detectStage({ post_visit_result: 'not_interested' }, 1)).toBe('post_visit')
  })
})

test.describe('priority 3 — greeting', () => {
  test('first message → greeting', () => {
    expect(detectStage({}, 1)).toBe('greeting')
  })

  test('zero messages → greeting', () => {
    expect(detectStage({}, 0)).toBe('greeting')
  })
})

test.describe('priority 4 — commitment', () => {
  test('status visit_booked → commitment regardless of score', () => {
    expect(detectStage({ name: 'Rahul', status: 'visit_booked', ai_score: 0 }, 5)).toBe('commitment')
  })

  test('ai_score >= 7 and status qualified → commitment', () => {
    expect(detectStage({ name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'], budget_min: 5000000, timeline: 'soon', ai_score: 8, status: 'qualified' }, 6)).toBe('commitment')
  })

  test('ai_score >= 7 but status not qualified → not commitment', () => {
    expect(detectStage({ name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'], budget_min: 5000000, timeline: 'soon', ai_score: 8, status: 'contacted' }, 6)).toBe('presentation')
  })
})

test.describe('priority 5 — presentation via ai_score', () => {
  test('ai_score >= 4 → presentation even with missing fields', () => {
    expect(detectStage({ ai_score: 4 }, 5)).toBe('presentation')
  })
})

test.describe('priority 6 — discovery (no criteria yet)', () => {
  test('no criteria, messageCount <= 4 → discovery', () => {
    expect(detectStage({}, 3)).toBe('discovery')
  })

  test('no name captured yet → discovery (so the bot asks for it)', () => {
    expect(detectStage({ intent: 'buy', preferred_areas: ['Baner'] }, 3)).toBe('discovery')
  })
})

test.describe('priority 7 — forced presentation at message 5+', () => {
  test('messageCount >= 5 with some criteria → presentation, even if discovery incomplete', () => {
    expect(detectStage({ intent: 'buy' }, 5)).toBe('presentation')
  })

  test('messageCount >= 5 with NO criteria → falls through, not forced to presentation', () => {
    expect(detectStage({}, 5)).toBe('discovery')
  })
})

test.describe('priority 8 — discovery (missing name/intent/areas)', () => {
  test('missing name → discovery', () => {
    expect(detectStage({ intent: 'buy', preferred_areas: ['Baner'], budget_min: 5000000 }, 3)).toBe('discovery')
  })

  test('missing intent → discovery', () => {
    expect(detectStage({ name: 'Rahul', preferred_areas: ['Baner'], budget_min: 5000000 }, 3)).toBe('discovery')
  })

  test('missing preferred_areas → discovery', () => {
    expect(detectStage({ name: 'Rahul', intent: 'buy', budget_min: 5000000 }, 3)).toBe('discovery')
  })
})

test.describe('priority 9 — qualification (missing budget/timeline)', () => {
  test('name + intent + area known, no budget → qualification', () => {
    expect(detectStage({ name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'] }, 4)).toBe('qualification')
  })

  test('budget known but no timeline → qualification', () => {
    expect(detectStage({ name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'], budget_min: 5000000 }, 4)).toBe('qualification')
  })
})

test.describe('priority 10 — nurture (cold + stalled)', () => {
  test('cold lead, messageCount > 6, fully qualified fields → nurture', () => {
    expect(detectStage({ name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'], budget_min: 5000000, timeline: 'soon', temperature: 'cold' }, 7)).toBe('nurture')
  })

  test('cold lead but messageCount <= 6 → not nurture yet', () => {
    expect(detectStage({ name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'], budget_min: 5000000, timeline: 'soon', temperature: 'cold' }, 6)).toBe('presentation')
  })
})

test.describe('priority 11 — default presentation', () => {
  test('all fields present, warm temperature → presentation', () => {
    expect(detectStage({ name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'], budget_min: 5000000, timeline: 'soon', temperature: 'warm' }, 7)).toBe('presentation')
  })
})
