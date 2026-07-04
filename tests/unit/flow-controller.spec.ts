import { test, expect } from '@playwright/test'
import { decideConversationFlow } from '../../lib/bot/flowController'

const agent = {
  agency_name: 'Rakesh Builders',
  languages: ['English', 'Hindi', 'Marathi'],
  property_types: ['Apartment', 'Independent house', 'Row house', 'Office', 'Shop', 'Plot'],
  deal_types: ['buy', 'rent'] as const,
}

test.describe('conversation flow controller', () => {
  test('normal step-by-step flow starts with language', () => {
    const first = decideConversationFlow({}, agent)
    expect(first.nextStep).toBe('ask_language')
    expect(first.reply).toContain('Which language')

    const name = decideConversationFlow({}, agent, { language: 'English' })
    expect(name.nextStep).toBe('ask_name')

    const propertyType = decideConversationFlow({ language: 'English' }, agent, { name: 'Rahul' })
    expect(propertyType.nextStep).toBe('ask_property_type')
  })

  test('customer gives all details in one message and controller jumps to search', () => {
    const result = decideConversationFlow({}, agent, {
      language: 'Hindi',
      name: 'Rahul',
      property_category: 'apartment',
      intent: 'rent',
      preferred_areas: ['Baner'],
      budget_max: 30000,
      bhk: '2BHK',
    })

    expect(result.readyToSearch).toBe(true)
    expect(result.nextStep).toBe('ready_to_search')
    expect(result.updates).toMatchObject({
      language: 'Hindi',
      name: 'Rahul',
      property_category: 'apartment',
      intent: 'rent',
      preferred_areas: ['Baner'],
      budget_max: 30000,
      bhk: '2BHK',
    })
  })

  test('does not repeat budget after customer says 30k', () => {
    const result = decideConversationFlow({
      language: 'English',
      name: 'Shantanu',
      property_category: 'apartment',
      intent: 'rent',
      preferred_areas: ['Baner'],
    }, agent, {
      budget_max: 30000,
    })

    expect(result.nextStep).toBe('ask_size')
    expect(result.reply.toLowerCase()).not.toContain('budget')
    expect(result.updates.budget_max).toBe(30000)
  })

  test('customer changes area and budget; newest answer wins', () => {
    const result = decideConversationFlow({
      language: 'English',
      name: 'Rahul',
      property_category: 'apartment',
      intent: 'rent',
      preferred_areas: ['Baner'],
      budget_max: 30000,
      bhk: '2BHK',
    }, agent, {
      preferred_areas: ['Wakad'],
      budget_max: 35000,
    })

    expect(result.readyToSearch).toBe(true)
    expect(result.mergedLead.preferred_areas).toEqual(['Wakad'])
    expect(result.mergedLead.budget_max).toBe(35000)
    expect(result.reply).toContain('Wakad')
    expect(result.reply).toContain('35,000')
  })

  test('language switch mid-conversation is saved and flow continues', () => {
    const result = decideConversationFlow({
      language: 'Hindi',
      name: 'Rahul',
      property_category: 'apartment',
      intent: 'buy',
      preferred_areas: ['Baner'],
      budget_max: 9000000,
    }, agent, {
      language: 'English',
    })

    expect(result.updates.language).toBe('English')
    expect(result.nextStep).toBe('ask_size')
  })

  test('agent with only sale enabled does not ask buy or rent', () => {
    const result = decideConversationFlow({
      language: 'English',
      name: 'Rahul',
      property_category: 'apartment',
    }, { ...agent, deal_types: ['buy'] }, {
      preferred_areas: ['Baner'],
    })

    expect(result.nextStep).toBe('ask_budget')
    expect(result.reply).toContain('budget')
  })

  test('uses only property types enabled by the agent', () => {
    const result = decideConversationFlow({
      language: 'English',
      name: 'Rahul',
    }, { ...agent, property_types: ['Apartment', 'Plot'] })

    expect(result.nextStep).toBe('ask_property_type')
    expect(result.reply).toContain('apartment')
    expect(result.reply).toContain('plot')
    expect(result.reply).not.toContain('shop')
  })

  test('no preference for bedrooms or size still allows search', () => {
    const result = decideConversationFlow({
      language: 'English',
      name: 'Rahul',
      property_category: 'apartment',
      intent: 'rent',
      preferred_areas: ['Baner'],
      budget_max: 30000,
    }, agent, {
      no_size_preference: true,
    })

    expect(result.readyToSearch).toBe(true)
    expect(result.nextStep).toBe('ready_to_search')
  })

  test('unclear input asks one clarification', () => {
    const result = decideConversationFlow({
      language: 'English',
      name: 'Rahul',
    }, agent, {
      clarification: { field: 'area', suggestion: 'Baner' },
    })

    expect(result.nextStep).toBe('clarify')
    expect(result.reply).toBe('Just to confirm, did you mean Baner?')
  })
})
