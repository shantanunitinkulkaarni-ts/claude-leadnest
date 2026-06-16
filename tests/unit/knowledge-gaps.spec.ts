import { test, expect } from '@playwright/test'
import { formatKnowledgeGapsForPrompt } from '../../lib/knowledgeGaps'

test.describe('formatKnowledgeGapsForPrompt', () => {
  test('returns empty string for no gaps', () => {
    expect(formatKnowledgeGapsForPrompt([])).toBe('')
  })

  test('formats a single Q&A pair', () => {
    const out = formatKnowledgeGapsForPrompt([{ question: 'Is parking included?', answer: 'Yes, one covered spot per unit.' }])
    expect(out).toContain('Q: Is parking included?')
    expect(out).toContain('A: Yes, one covered spot per unit.')
    expect(out).toContain('AGENT-PROVIDED ANSWERS')
  })

  test('formats multiple Q&A pairs, each on its own block', () => {
    const out = formatKnowledgeGapsForPrompt([
      { question: 'Q1?', answer: 'A1.' },
      { question: 'Q2?', answer: 'A2.' },
    ])
    expect(out).toContain('Q: Q1?')
    expect(out).toContain('A: A1.')
    expect(out).toContain('Q: Q2?')
    expect(out).toContain('A: A2.')
  })
})
