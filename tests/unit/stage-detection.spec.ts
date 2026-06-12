import { test, expect } from '@playwright/test'
import { detectStage } from '../../lib/gemini'

/**
 * Scenario tests for which conversation stage the bot uses.
 * Locks in name-capture-first and prevents regressions in stage routing.
 */

test('first message → greeting', () => {
  expect(detectStage({}, 1)).toBe('greeting')
})

test('no name captured yet → discovery (so the bot asks for it)', () => {
  expect(detectStage({ intent: 'buy', preferred_areas: ['Baner'] }, 3)).toBe('discovery')
})

test('name + intent + area known, no budget → qualification', () => {
  expect(detectStage({ name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'] }, 4)).toBe('qualification')
})

test('hot qualified lead → commitment', () => {
  expect(detectStage({ name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'], budget_min: 5000000, timeline: 'soon', ai_score: 8, status: 'qualified' }, 6)).toBe('commitment')
})

test('closed lead → closed', () => {
  expect(detectStage({ status: 'closed_won', name: 'Rahul' }, 10)).toBe('closed')
})

test('visit done → post_visit', () => {
  expect(detectStage({ name: 'Rahul', status: 'visit_done', intent: 'buy', preferred_areas: ['Baner'] }, 8)).toBe('post_visit')
})
