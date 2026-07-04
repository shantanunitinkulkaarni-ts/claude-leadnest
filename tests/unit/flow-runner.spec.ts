import { test, expect } from '@playwright/test'
import { runConversationFlowStep } from '../../lib/bot/flowRunner'
import type { ExtractedIntent } from '../../lib/intentExtractor'

const agent = {
  agency_name: 'Rakesh Builders',
  languages: ['English', 'Hindi', 'Marathi'],
  property_types: ['Apartment', 'Independent house', 'Row house', 'Office', 'Shop', 'Plot'],
  deal_types: ['buy', 'rent'] as const,
}

const emptyIntent: ExtractedIntent = {
  name: null,
  intent: null,
  property_category: null,
  areas: [],
  bhk: null,
  budget_min: null,
  budget_max: null,
  message_type: 'other',
  visit_time_text: null,
  language: null,
}

test.describe('conversation flow runner', () => {
  test('uses extracted budget and does not repeat the budget question', async () => {
    const result = await runConversationFlowStep({
      agent,
      lead: {
        language: 'English',
        name: 'Shantanu',
        property_category: 'apartment',
        intent: 'rent',
        preferred_areas: ['Baner'],
      },
      message: '30 k',
    }, {
      decoder: async () => ({ ...emptyIntent, raw_message: '30 k', budget_max: 30000, message_type: 'qualifying_answer' }),
    })

    expect(result.extracted.budget_max).toBe(30000)
    expect(result.decision.nextStep).toBe('ask_size')
    expect(result.decision.reply.toLowerCase()).not.toContain('budget')
  })

  test('passes recent context and known lead facts to extractor', async () => {
    let seen: any = null
    await runConversationFlowStep({
      agent,
      lead: {
        language: 'English',
        property_category: 'apartment',
        intent: 'rent',
        preferred_areas: ['Baner'],
        budget_max: 30000,
      },
      message: '2BHK',
      recent: [{ role: 'assistant', content: 'How many bedrooms are you looking for?' }],
    }, {
      decoder: async (_message, opts) => {
        seen = opts
        return { ...emptyIntent, raw_message: '2BHK', bhk: '2BHK', message_type: 'qualifying_answer' }
      },
    })

    expect(seen.known).toMatchObject({
      intent: 'rent',
      areas: ['Baner'],
      budget_max: 30000,
      property_category: 'apartment',
      language: 'english',
    })
    expect(seen.recent).toEqual([{ role: 'assistant', content: 'How many bedrooms are you looking for?' }])
  })

  test('explicit language switch in text overrides extractor language', async () => {
    const result = await runConversationFlowStep({
      agent,
      lead: {
        language: 'Hindi',
        name: 'Rahul',
        property_category: 'apartment',
        intent: 'buy',
        preferred_areas: ['Wakad'],
        budget_max: 9000000,
      },
      message: 'English please',
    }, {
      decoder: async () => ({ ...emptyIntent, raw_message: 'English please', message_type: 'qualifying_answer' }),
    })

    expect(result.decision.updates.language).toBe('en')
    expect(result.decision.nextStep).toBe('ask_size')
  })

  test('complete extracted requirement becomes ready to search', async () => {
    const result = await runConversationFlowStep({
      agent,
      lead: {},
      message: 'Hindi. Rahul. 2BHK apartment rent in Baner under 30k',
    }, {
      decoder: async () => ({
        ...emptyIntent,
        raw_message: 'Hindi. Rahul. 2BHK apartment rent in Baner under 30k',
        name: 'Rahul',
        language: 'hindi',
        property_category: 'apartment',
        intent: 'rent',
        areas: ['Baner'],
        bhk: '2BHK',
        budget_max: 30000,
        message_type: 'property_request',
      }),
    })

    expect(result.decision.readyToSearch).toBe(true)
    expect(result.decision.mergedLead).toMatchObject({
      language: 'hi',
      property_category: 'apartment',
      intent: 'rent',
      preferred_areas: ['Baner'],
      bhk: '2BHK',
      budget_max: 30000,
    })
  })

  test('plain hi starts with language question', async () => {
    const result = await runConversationFlowStep({
      agent,
      lead: {},
      message: 'hi',
    }, {
      decoder: async () => ({
        ...emptyIntent,
        raw_message: 'hi',
        message_type: 'greeting',
        language: null,
      }),
    })

    expect(result.decision.nextStep).toBe('ask_language')
    expect(result.decision.reply).toContain('Which language')
  })
})
