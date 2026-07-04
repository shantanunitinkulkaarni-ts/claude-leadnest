import { test, expect } from '@playwright/test'
import { aiDecoder } from '../../lib/bot/aiDecoder'

test.describe('aiDecoder', () => {
  test('plain hi is decoded as greeting, not language choice', async () => {
    const fakeLLM = async () => '{"message_type":"greeting","language":"english"}'
    const decoded = await aiDecoder('hi', {}, { llm: fakeLLM as any })

    expect(decoded.message_type).toBe('greeting')
    expect(decoded.language).toBeNull()
    expect(decoded.name).toBeNull()
    expect(decoded.raw_message).toBe('hi')
  })

  test('namaste is decoded as greeting, not Hindi language preference', async () => {
    const fakeLLM = async () => '{"message_type":"greeting","language":"hindi"}'
    const decoded = await aiDecoder('namaste', {}, { llm: fakeLLM as any })

    expect(decoded.message_type).toBe('greeting')
    expect(decoded.language).toBeNull()
  })

  test('property request remains structured and ready for the app', async () => {
    const fakeLLM = async () => JSON.stringify({
      name: null,
      intent: 'rent',
      property_category: 'apartment',
      areas: ['Baner'],
      bhk: '2BHK',
      budget_min: null,
      budget_max: 30000,
      message_type: 'property_request',
      visit_time_text: null,
      language: 'english',
    })

    const decoded = await aiDecoder('I want 2BHK rent in Baner under 30k', {}, { llm: fakeLLM as any })

    expect(decoded).toMatchObject({
      intent: 'rent',
      property_category: 'apartment',
      areas: ['Baner'],
      bhk: '2BHK',
      budget_max: 30000,
      message_type: 'property_request',
      language: 'english',
    })
  })

  test('rent range after budget question is decoded into INR min and max', async () => {
    const fakeLLM = async () => JSON.stringify({
      name: null,
      intent: null,
      property_category: null,
      areas: [],
      bhk: null,
      budget_min: 20000,
      budget_max: 30000,
      message_type: 'qualifying_answer',
      visit_time_text: null,
      language: null,
    })

    const decoded = await aiDecoder('20-30k', {
      recent: [{ role: 'assistant', content: 'What monthly rent range are you comfortable with?' }],
      known: { intent: 'rent' },
    }, { llm: fakeLLM as any })

    expect(decoded.budget_min).toBe(20000)
    expect(decoded.budget_max).toBe(30000)
  })

  test('no pref is decoded as no bedroom preference', async () => {
    const fakeLLM = async () => JSON.stringify({
      message_type: 'qualifying_answer',
      bhk: null,
    })

    const decoded = await aiDecoder('no pref.', {
      recent: [{ role: 'assistant', content: 'How many bedrooms are you looking for? You can also say no preference.' }],
    }, { llm: fakeLLM as any })

    expect(decoded.bhk).toBe('no_preference')
    expect(decoded.message_type).toBe('qualifying_answer')
  })

  test('AI failure returns safe parsed shape', async () => {
    const boom = async () => { throw new Error('down') }
    const decoded = await aiDecoder('hi', {}, { llm: boom as any })

    expect(decoded.message_type).toBe('greeting')
    expect(decoded.language).toBeNull()
    expect(decoded.raw_message).toBe('hi')
  })
})
