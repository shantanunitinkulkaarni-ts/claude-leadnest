import { test, expect } from '@playwright/test'
import { buildEnginePrompt, stripEmojisFromReplyLine } from '../../lib/gemini'
import { baseAgent, sampleProperties } from '../evals/scenarios'

/**
 * Phase 4B — per-agent bot tone was "weakly used": the TONE line was a single
 * sentence buried in an 800+ line prompt, while the casual emoji-heavy
 * few-shot EXAMPLES and the emoji-based PROPERTY DETAILS FORMAT silently
 * contradicted a 'professional' agent's "no emojis" setting. These tests lock
 * in that a non-default tone actually changes what the LLM sees.
 */

function buildPrompt(tone: string) {
  const agent = { ...baseAgent, bot_tone: tone }
  const lead = { phone: '+910000000000', name: 'Rahul' }
  const ctx = {
    agent, lead, properties: sampleProperties,
    currentTime: '15 June 2026, 5:00 pm', isOfficeHours: true,
    canSendPhotos: true, reschedulingLocked: false, detectedLang: null as string | null,
    incomingMessage: 'tell me more about this property',
  }
  return buildEnginePrompt(ctx, 'presentation', 6)
}

test.describe('stripEmojisFromReplyLine', () => {
  test('strips astral-plane emoji from the You: line only', () => {
    const out = stripEmojisFromReplyLine('Lead: Hi\nYou: Hi! Welcome 😊 to the team\n{"score":1}')
    expect(out).toBe('Lead: Hi\nYou: Hi! Welcome to the team\n{"score":1}')
  })

  test('strips BMP dingbat emoji (e.g. checkmark)', () => {
    const out = stripEmojisFromReplyLine('You: East-facing ✅ confirmed')
    expect(out).not.toContain('✅')
  })

  test('strips trailing variation selector (e.g. on 🛏️)', () => {
    const out = stripEmojisFromReplyLine('You: 🛏️ 2BHK available')
    expect(out).not.toContain('️')
  })

  test('never touches the Lead: line or the JSON line', () => {
    const out = stripEmojisFromReplyLine('Lead: 😊 hi\nYou: hi\n{"score":1,"note":"😊"}')
    expect(out).toContain('Lead: 😊 hi')
    expect(out).toContain('"note":"😊"')
  })

  test('leaves a friendly-tone line untouched when no emoji present', () => {
    const out = stripEmojisFromReplyLine('You: plain text, no emoji here')
    expect(out).toBe('You: plain text, no emoji here')
  })
})

test.describe('buildEnginePrompt — tone injection', () => {
  test('friendly tone (default): no mandatory tone directive, emoji property format', () => {
    const prompt = buildPrompt('friendly')
    expect(prompt).not.toContain('MANDATORY TONE RULE')
    expect(prompt).toContain('🏡 *[Title]*')
  })

  test('professional tone: mandatory directive injected up front', () => {
    const prompt = buildPrompt('professional')
    expect(prompt.indexOf('MANDATORY TONE RULE')).toBeGreaterThanOrEqual(0)
    // Placed before the main "You are the Convorian Conversion Engine" body, like langDirective.
    expect(prompt.indexOf('MANDATORY TONE RULE')).toBeLessThan(prompt.indexOf('You are the Convorian Conversion Engine'))
  })

  test('professional tone: property card format drops emojis', () => {
    const prompt = buildPrompt('professional')
    expect(prompt).not.toContain('🏡 *[Title]*')
    expect(prompt).toContain('Location: [Location]')
  })

  test('professional tone: few-shot examples have emojis stripped', () => {
    const prompt = buildPrompt('professional')
    const examplesBlock = prompt.slice(prompt.indexOf('EXAMPLES ('), prompt.indexOf('RESPONSE FORMAT'))
    expect(examplesBlock).not.toMatch(/[\uD800-\uDBFF][\uDC00-\uDFFF]/)
  })

  test('professional tone: reminder restated again right before RESPONSE FORMAT (recency)', () => {
    const prompt = buildPrompt('professional')
    const reminderIdx = prompt.lastIndexOf('this agency\'s tone is "professional"')
    expect(reminderIdx).toBeGreaterThanOrEqual(0)
    expect(reminderIdx).toBeLessThan(prompt.indexOf('RESPONSE FORMAT'))
  })

  test('concise tone: mandatory directive also injected', () => {
    const prompt = buildPrompt('concise')
    expect(prompt).toContain('MANDATORY TONE RULE')
    expect(prompt).toContain('Maximum 2-3 sentences')
  })
})
