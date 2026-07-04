import { test, expect } from '@playwright/test'
import { simulateFlowTurns } from '../../lib/bot/flowSimulation'

const agent = {
  agency_name: 'Rakesh Builders',
  languages: ['English', 'Hindi', 'Marathi'],
  property_types: ['Apartment', 'Independent house', 'Row house', 'Office', 'Shop', 'Plot'],
  deal_types: ['buy', 'rent'] as const,
}

test.describe('internal bot flow simulation', () => {
  test('replays the real 30k rental path without repeating the budget question', () => {
    const turns = simulateFlowTurns({
      agent,
      turns: [
        { customer: 'hi', extracted: {} },
        { customer: 'English', extracted: { language: 'English' } },
        { customer: 'Shantanu', extracted: { name: 'Shantanu' } },
        { customer: 'apartment', extracted: { property_category: 'apartment' } },
        { customer: 'rent', extracted: { intent: 'rent' } },
        { customer: 'baner', extracted: { preferred_areas: ['Baner'] } },
        { customer: '30 k', extracted: { budget_max: 30000 } },
      ],
    })

    expect(turns.map(t => t.decision.nextStep)).toEqual([
      'ask_language',
      'ask_name',
      'ask_property_type',
      'ask_intent',
      'ask_area',
      'ask_budget',
      'ask_size',
    ])
    const last = turns[turns.length - 1]
    expect(last.leadAfter.budget_max).toBe(30000)
    expect(last.decision.reply.toLowerCase()).not.toContain('budget')
  })

  test('jumps to search when the extractor finds a complete requirement at once', () => {
    const turns = simulateFlowTurns({
      agent,
      turns: [
        {
          customer: 'Hindi. Rahul. 2BHK apartment rent in Baner under 30k',
          extracted: {
            language: 'Hindi',
            name: 'Rahul',
            property_category: 'apartment',
            intent: 'rent',
            preferred_areas: ['Baner'],
            budget_max: 30000,
            bhk: '2BHK',
          },
        },
      ],
    })

    expect(turns).toHaveLength(1)
    expect(turns[0].decision.readyToSearch).toBe(true)
    expect(turns[0].decision.nextStep).toBe('ready_to_search')
    expect(turns[0].leadAfter).toMatchObject({
      language: 'Hindi',
      name: 'Rahul',
      property_category: 'apartment',
      intent: 'rent',
      preferred_areas: ['Baner'],
      budget_max: 30000,
      bhk: '2BHK',
    })
  })

  test('accepts extractor output shape with areas field', () => {
    const turns = simulateFlowTurns({
      agent,
      lead: {
        language: 'English',
        name: 'Rahul',
        property_category: 'apartment',
      },
      turns: [
        {
          customer: 'rent in bnaer around 30k',
          extracted: {
            intent: 'rent',
            property_category: null,
            areas: ['Baner'],
            bhk: null,
            budget_min: null,
            budget_max: 30000,
            message_type: 'property_request',
            visit_time_text: null,
            language: null,
          },
        },
      ],
    })

    expect(turns[0].leadAfter.preferred_areas).toEqual(['Baner'])
    expect(turns[0].leadAfter.budget_max).toBe(30000)
    expect(turns[0].decision.nextStep).toBe('ask_size')
  })

  test('supports customer switching language mid-flow', () => {
    const turns = simulateFlowTurns({
      agent,
      lead: {
        language: 'Hindi',
        name: 'Rahul',
        property_category: 'apartment',
        intent: 'buy',
        preferred_areas: ['Wakad'],
        budget_max: 9000000,
      },
      turns: [
        { customer: 'explain in English', extracted: { language: 'English' } },
      ],
    })

    expect(turns[0].leadAfter.language).toBe('English')
    expect(turns[0].decision.nextStep).toBe('ask_size')
  })
})
