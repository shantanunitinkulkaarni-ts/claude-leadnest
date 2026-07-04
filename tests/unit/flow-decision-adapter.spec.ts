import { test, expect } from '@playwright/test'
import {
  flowDecisionToAiDecision,
  shouldUseConversationFlow,
} from '../../lib/bot/flowDecisionAdapter'
import type { FlowDecision } from '../../lib/bot/flowController'

test.describe('live bot flow adapter', () => {
  test('turns a ready flow decision into a property search action', () => {
    const flow: FlowDecision = {
      stage: 'property_shown',
      nextStep: 'ready_to_search',
      reply: 'Searching now.',
      readyToSearch: true,
      mergedLead: {},
      updates: {
        name: 'Rahul',
        property_category: 'apartment',
        intent: 'rent',
        preferred_areas: ['Baner'],
        budget_min: 20000,
        budget_max: 30000,
        bhk: '2BHK',
      },
    }

    expect(flowDecisionToAiDecision(flow)).toEqual({
      stage: 'property_shown',
      reply: 'Searching now.',
      action: 'search_properties',
      updates: {
        name: 'Rahul',
        property_category: 'apartment',
        intent: 'rent',
        preferred_areas: ['Baner'],
        budget_min: 20000,
        budget_max: 30000,
        bhk: '2BHK',
      },
    })
  })

  test('keeps booking, photo, and human-help turns on the old live path', () => {
    expect(shouldUseConversationFlow({ lead: {}, extractedMessageType: 'booking_request' })).toBe(false)
    expect(shouldUseConversationFlow({ lead: {}, extractedMessageType: 'wants_photos' })).toBe(false)
    expect(shouldUseConversationFlow({ lead: {}, extractedMessageType: 'wants_human' })).toBe(false)
  })

  test('does not take over once a property or visit is already active', () => {
    expect(shouldUseConversationFlow({ lead: { matched_property_id: 'p1' } })).toBe(false)
    expect(shouldUseConversationFlow({ lead: { pending_appointment_time: '2026-07-05T10:00:00.000Z' } })).toBe(false)
    expect(shouldUseConversationFlow({ lead: {}, existingAppointment: { id: 'a1' } })).toBe(false)
  })

  test('allows normal early qualification turns', () => {
    expect(shouldUseConversationFlow({ lead: { status: 'new' }, extractedMessageType: 'property_request' })).toBe(true)
  })
})
