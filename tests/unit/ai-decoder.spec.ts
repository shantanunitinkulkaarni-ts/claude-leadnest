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
      budget: '30k',
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

  test('AI failure returns safe parsed shape', async () => {
    const boom = async () => { throw new Error('down') }
    const decoded = await aiDecoder('hi', {}, { llm: boom as any })

    expect(decoded.message_type).toBe('greeting')
    expect(decoded.language).toBeNull()
    expect(decoded.raw_message).toBe('hi')
  })
})
