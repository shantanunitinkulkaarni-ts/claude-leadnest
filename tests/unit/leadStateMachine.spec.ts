/**
 * Unit Tests: leadStateMachine.ts (Playwright)
 * 50+ tests covering state definitions, transitions, preconditions, idempotency
 */

import { test, expect } from '@playwright/test'
import {
  LeadStates,
  getAllStates,
  getNextStates,
  isValidTransition,
  getNextStateForAction,
} from '@/lib/leadStateMachine'

import type { LeadState } from '@/lib/leadStateMachine'

test.describe('leadStateMachine', () => {
  test.describe('State Definition Tests', () => {
    test('all 17 states exist', () => {
      const states = getAllStates()
      expect(states.length).toBe(17)
    })

    test('state names are correct', () => {
      expect(LeadStates.NEW).toBe('NEW')
      expect(LeadStates.IN_CONVERSATION).toBe('IN_CONVERSATION')
      expect(LeadStates.QUALIFYING).toBe('QUALIFYING')
      expect(LeadStates.QUALIFIED).toBe('QUALIFIED')
      expect(LeadStates.PROPERTY_SHOWN).toBe('PROPERTY_SHOWN')
      expect(LeadStates.INTERESTED).toBe('INTERESTED')
      expect(LeadStates.VISIT_REQUESTED).toBe('VISIT_REQUESTED')
      expect(LeadStates.AWAITING_BROKER_APPROVAL).toBe('AWAITING_BROKER_APPROVAL')
      expect(LeadStates.VISIT_CONFIRMED).toBe('VISIT_CONFIRMED')
      expect(LeadStates.VISIT_COMPLETED).toBe('VISIT_COMPLETED')
      expect(LeadStates.INACTIVE_24H).toBe('INACTIVE_24H')
      expect(LeadStates.INACTIVE_3D).toBe('INACTIVE_3D')
      expect(LeadStates.INACTIVE_7D).toBe('INACTIVE_7D')
      expect(LeadStates.DORMANT).toBe('DORMANT')
      expect(LeadStates.RESURRECTED).toBe('RESURRECTED')
      expect(LeadStates.LOST).toBe('LOST')
      expect(LeadStates.CONVERTED).toBe('CONVERTED')
    })

    test('no duplicate state names', () => {
      const states = getAllStates()
      const unique = new Set(states)
      expect(unique.size).toBe(states.length)
    })

    test('state constants are defined', () => {
      expect(LeadStates).toBeDefined()
      expect(Object.keys(LeadStates).length).toBe(17)
    })
  })

  test.describe('Transition Matrix Tests', () => {
    test('NEW can transition to IN_CONVERSATION', () => {
      expect(isValidTransition(LeadStates.NEW, LeadStates.IN_CONVERSATION)).toBe(true)
    })

    test('NEW can transition to INACTIVE_24H', () => {
      expect(isValidTransition(LeadStates.NEW, LeadStates.INACTIVE_24H)).toBe(true)
    })

    test('NEW cannot transition to QUALIFIED', () => {
      expect(isValidTransition(LeadStates.NEW, LeadStates.QUALIFIED)).toBe(false)
    })

    test('IN_CONVERSATION can transition to QUALIFYING', () => {
      expect(isValidTransition(LeadStates.IN_CONVERSATION, LeadStates.QUALIFYING)).toBe(true)
    })

    test('QUALIFYING can transition to QUALIFIED', () => {
      expect(isValidTransition(LeadStates.QUALIFYING, LeadStates.QUALIFIED)).toBe(true)
    })

    test('QUALIFIED can transition to PROPERTY_SHOWN', () => {
      expect(isValidTransition(LeadStates.QUALIFIED, LeadStates.PROPERTY_SHOWN)).toBe(true)
    })

    test('PROPERTY_SHOWN can transition to INTERESTED', () => {
      expect(isValidTransition(LeadStates.PROPERTY_SHOWN, LeadStates.INTERESTED)).toBe(true)
    })

    test('PROPERTY_SHOWN can transition back to QUALIFYING', () => {
      expect(isValidTransition(LeadStates.PROPERTY_SHOWN, LeadStates.QUALIFYING)).toBe(true)
    })

    test('INTERESTED can transition to VISIT_REQUESTED', () => {
      expect(isValidTransition(LeadStates.INTERESTED, LeadStates.VISIT_REQUESTED)).toBe(true)
    })

    test('VISIT_REQUESTED can transition to AWAITING_BROKER_APPROVAL', () => {
      expect(isValidTransition(LeadStates.VISIT_REQUESTED, LeadStates.AWAITING_BROKER_APPROVAL)).toBe(true)
    })

    test('AWAITING_BROKER_APPROVAL can transition to VISIT_CONFIRMED', () => {
      expect(isValidTransition(LeadStates.AWAITING_BROKER_APPROVAL, LeadStates.VISIT_CONFIRMED)).toBe(true)
    })

    test('AWAITING_BROKER_APPROVAL can transition back to VISIT_REQUESTED (rejection)', () => {
      expect(isValidTransition(LeadStates.AWAITING_BROKER_APPROVAL, LeadStates.VISIT_REQUESTED)).toBe(true)
    })

    test('VISIT_CONFIRMED can transition to VISIT_COMPLETED', () => {
      expect(isValidTransition(LeadStates.VISIT_CONFIRMED, LeadStates.VISIT_COMPLETED)).toBe(true)
    })

    test('VISIT_COMPLETED can transition to CONVERTED', () => {
      expect(isValidTransition(LeadStates.VISIT_COMPLETED, LeadStates.CONVERTED)).toBe(true)
    })

    test('VISIT_COMPLETED can transition to LOST', () => {
      expect(isValidTransition(LeadStates.VISIT_COMPLETED, LeadStates.LOST)).toBe(true)
    })

    test('INACTIVE_24H can transition to RESURRECTED', () => {
      expect(isValidTransition(LeadStates.INACTIVE_24H, LeadStates.RESURRECTED)).toBe(true)
    })

    test('INACTIVE_24H can transition to INACTIVE_3D', () => {
      expect(isValidTransition(LeadStates.INACTIVE_24H, LeadStates.INACTIVE_3D)).toBe(true)
    })

    test('INACTIVE_3D can transition to INACTIVE_7D', () => {
      expect(isValidTransition(LeadStates.INACTIVE_3D, LeadStates.INACTIVE_7D)).toBe(true)
    })

    test('INACTIVE_7D can transition to DORMANT', () => {
      expect(isValidTransition(LeadStates.INACTIVE_7D, LeadStates.DORMANT)).toBe(true)
    })

    test('DORMANT can transition to LOST', () => {
      expect(isValidTransition(LeadStates.DORMANT, LeadStates.LOST)).toBe(true)
    })

    test('terminal states have no next states', () => {
      expect(getNextStates(LeadStates.LOST).length).toBe(0)
      expect(getNextStates(LeadStates.CONVERTED).length).toBe(0)
    })

    test('RESURRECTED is a transient state', () => {
      expect(getNextStates(LeadStates.RESURRECTED).length).toBe(0)
    })
  })

  test.describe('Disallowed Transitions', () => {
    test('NEW cannot go directly to PROPERTY_SHOWN', () => {
      expect(isValidTransition(LeadStates.NEW, LeadStates.PROPERTY_SHOWN)).toBe(false)
    })

    test('PROPERTY_SHOWN cannot go to CONVERTED', () => {
      expect(isValidTransition(LeadStates.PROPERTY_SHOWN, LeadStates.CONVERTED)).toBe(false)
    })

    test('VISIT_CONFIRMED cannot go back to VISIT_REQUESTED', () => {
      expect(isValidTransition(LeadStates.VISIT_CONFIRMED, LeadStates.VISIT_REQUESTED)).toBe(false)
    })

    test('CONVERTED cannot transition anywhere', () => {
      expect(isValidTransition(LeadStates.CONVERTED, LeadStates.LOST)).toBe(false)
      expect(isValidTransition(LeadStates.CONVERTED, LeadStates.NEW)).toBe(false)
    })

    test('LOST cannot transition anywhere', () => {
      expect(isValidTransition(LeadStates.LOST, LeadStates.NEW)).toBe(false)
    })
  })

  test.describe('getNextStates (matrix inspection)', () => {
    test('NEW has 2 next states', () => {
      expect(getNextStates(LeadStates.NEW).length).toBe(2)
      expect(getNextStates(LeadStates.NEW)).toContain(LeadStates.IN_CONVERSATION)
      expect(getNextStates(LeadStates.NEW)).toContain(LeadStates.INACTIVE_24H)
    })

    test('PROPERTY_SHOWN has 3 next states', () => {
      expect(getNextStates(LeadStates.PROPERTY_SHOWN).length).toBe(3)
      expect(getNextStates(LeadStates.PROPERTY_SHOWN)).toContain(LeadStates.INTERESTED)
      expect(getNextStates(LeadStates.PROPERTY_SHOWN)).toContain(LeadStates.QUALIFYING)
      expect(getNextStates(LeadStates.PROPERTY_SHOWN)).toContain(LeadStates.INACTIVE_24H)
    })

    test('AWAITING_BROKER_APPROVAL has 2 next states', () => {
      expect(getNextStates(LeadStates.AWAITING_BROKER_APPROVAL).length).toBe(2)
      expect(getNextStates(LeadStates.AWAITING_BROKER_APPROVAL)).toContain(LeadStates.VISIT_CONFIRMED)
      expect(getNextStates(LeadStates.AWAITING_BROKER_APPROVAL)).toContain(LeadStates.VISIT_REQUESTED)
    })

    test('DORMANT has 2 next states', () => {
      expect(getNextStates(LeadStates.DORMANT).length).toBe(2)
      expect(getNextStates(LeadStates.DORMANT)).toContain(LeadStates.RESURRECTED)
      expect(getNextStates(LeadStates.DORMANT)).toContain(LeadStates.LOST)
    })
  })

  test.describe('Action → State Mapping', () => {
    test('intent_detected maps to IN_CONVERSATION', () => {
      const nextState = getNextStateForAction(LeadStates.NEW, 'intent_detected')
      expect(nextState).toBe(LeadStates.IN_CONVERSATION)
    })

    test('area_provided maps to QUALIFYING', () => {
      const nextState = getNextStateForAction(LeadStates.IN_CONVERSATION, 'area_provided')
      expect(nextState).toBe(LeadStates.QUALIFYING)
    })

    test('criteria_complete maps to QUALIFIED', () => {
      const nextState = getNextStateForAction(LeadStates.QUALIFYING, 'criteria_complete')
      expect(nextState).toBe(LeadStates.QUALIFIED)
    })

    test('properties_searched maps to PROPERTY_SHOWN', () => {
      const nextState = getNextStateForAction(LeadStates.QUALIFIED, 'properties_searched')
      expect(nextState).toBe(LeadStates.PROPERTY_SHOWN)
    })

    test('no_match maps to PROPERTY_SHOWN (same state)', () => {
      const nextState = getNextStateForAction(LeadStates.QUALIFIED, 'no_match')
      expect(nextState).toBe(LeadStates.PROPERTY_SHOWN)
    })

    test('property_interested maps to INTERESTED', () => {
      const nextState = getNextStateForAction(LeadStates.PROPERTY_SHOWN, 'property_interested')
      expect(nextState).toBe(LeadStates.INTERESTED)
    })

    test('visit_requested maps to VISIT_REQUESTED', () => {
      const nextState = getNextStateForAction(LeadStates.INTERESTED, 'visit_requested')
      expect(nextState).toBe(LeadStates.VISIT_REQUESTED)
    })

    test('broker_approved maps to VISIT_CONFIRMED', () => {
      const nextState = getNextStateForAction(LeadStates.AWAITING_BROKER_APPROVAL, 'broker_approved')
      expect(nextState).toBe(LeadStates.VISIT_CONFIRMED)
    })

    test('broker_rejected maps to VISIT_REQUESTED', () => {
      const nextState = getNextStateForAction(LeadStates.AWAITING_BROKER_APPROVAL, 'broker_rejected')
      expect(nextState).toBe(LeadStates.VISIT_REQUESTED)
    })

    test('visit_completed maps to VISIT_COMPLETED', () => {
      const nextState = getNextStateForAction(LeadStates.VISIT_CONFIRMED, 'visit_completed')
      expect(nextState).toBe(LeadStates.VISIT_COMPLETED)
    })

    test('deal_won maps to CONVERTED', () => {
      const nextState = getNextStateForAction(LeadStates.VISIT_COMPLETED, 'deal_won')
      expect(nextState).toBe(LeadStates.CONVERTED)
    })

    test('deal_lost maps to LOST', () => {
      const nextState = getNextStateForAction(LeadStates.VISIT_COMPLETED, 'deal_lost')
      expect(nextState).toBe(LeadStates.LOST)
    })

    test('window_expired maps to INACTIVE_24H', () => {
      const nextState = getNextStateForAction(LeadStates.QUALIFIED, 'window_expired')
      expect(nextState).toBe(LeadStates.INACTIVE_24H)
    })

    test('lead_replied maps to RESURRECTED from INACTIVE_24H', () => {
      const nextState = getNextStateForAction(LeadStates.INACTIVE_24H, 'lead_replied')
      expect(nextState).toBe(LeadStates.RESURRECTED)
    })

    test('invalid action returns null', () => {
      const nextState = getNextStateForAction(LeadStates.NEW, 'unknown_action')
      expect(nextState).toBeNull()
    })

    test('action that violates matrix returns null', () => {
      const nextState = getNextStateForAction(LeadStates.NEW, 'deal_won')
      expect(nextState).toBeNull()
    })
  })

  test.describe('Full Funnel Paths', () => {
    test('happy path: NEW → IN_CONVERSATION → QUALIFYING → QUALIFIED → PROPERTY_SHOWN → INTERESTED → VISIT_REQUESTED → AWAITING_BROKER_APPROVAL → VISIT_CONFIRMED', () => {
      expect(isValidTransition(LeadStates.NEW, LeadStates.IN_CONVERSATION)).toBe(true)
      expect(isValidTransition(LeadStates.IN_CONVERSATION, LeadStates.QUALIFYING)).toBe(true)
      expect(isValidTransition(LeadStates.QUALIFYING, LeadStates.QUALIFIED)).toBe(true)
      expect(isValidTransition(LeadStates.QUALIFIED, LeadStates.PROPERTY_SHOWN)).toBe(true)
      expect(isValidTransition(LeadStates.PROPERTY_SHOWN, LeadStates.INTERESTED)).toBe(true)
      expect(isValidTransition(LeadStates.INTERESTED, LeadStates.VISIT_REQUESTED)).toBe(true)
      expect(isValidTransition(LeadStates.VISIT_REQUESTED, LeadStates.AWAITING_BROKER_APPROVAL)).toBe(true)
      expect(isValidTransition(LeadStates.AWAITING_BROKER_APPROVAL, LeadStates.VISIT_CONFIRMED)).toBe(true)
    })

    test('inactive ladder: QUALIFIED → INACTIVE_24H → INACTIVE_3D → INACTIVE_7D → DORMANT → LOST', () => {
      expect(isValidTransition(LeadStates.QUALIFIED, LeadStates.INACTIVE_24H)).toBe(true)
      expect(isValidTransition(LeadStates.INACTIVE_24H, LeadStates.INACTIVE_3D)).toBe(true)
      expect(isValidTransition(LeadStates.INACTIVE_3D, LeadStates.INACTIVE_7D)).toBe(true)
      expect(isValidTransition(LeadStates.INACTIVE_7D, LeadStates.DORMANT)).toBe(true)
      expect(isValidTransition(LeadStates.DORMANT, LeadStates.LOST)).toBe(true)
    })

    test('broker rejection: AWAITING_BROKER_APPROVAL → VISIT_REQUESTED → AWAITING_BROKER_APPROVAL again', () => {
      expect(isValidTransition(LeadStates.AWAITING_BROKER_APPROVAL, LeadStates.VISIT_REQUESTED)).toBe(true)
      expect(isValidTransition(LeadStates.VISIT_REQUESTED, LeadStates.AWAITING_BROKER_APPROVAL)).toBe(true)
    })

    test('post-visit outcomes: VISIT_CONFIRMED → VISIT_COMPLETED → CONVERTED', () => {
      expect(isValidTransition(LeadStates.VISIT_CONFIRMED, LeadStates.VISIT_COMPLETED)).toBe(true)
      expect(isValidTransition(LeadStates.VISIT_COMPLETED, LeadStates.CONVERTED)).toBe(true)
    })

    test('property rejection: PROPERTY_SHOWN → QUALIFYING → QUALIFIED (re-qualify)', () => {
      expect(isValidTransition(LeadStates.PROPERTY_SHOWN, LeadStates.QUALIFYING)).toBe(true)
      expect(isValidTransition(LeadStates.QUALIFYING, LeadStates.QUALIFIED)).toBe(true)
    })
  })

  test.describe('Resurrection Logic', () => {
    test('RESURRECTED from INACTIVE_24H', () => {
      expect(isValidTransition(LeadStates.INACTIVE_24H, LeadStates.RESURRECTED)).toBe(true)
    })

    test('RESURRECTED from INACTIVE_3D', () => {
      expect(isValidTransition(LeadStates.INACTIVE_3D, LeadStates.RESURRECTED)).toBe(true)
    })

    test('RESURRECTED from INACTIVE_7D', () => {
      expect(isValidTransition(LeadStates.INACTIVE_7D, LeadStates.RESURRECTED)).toBe(true)
    })

    test('RESURRECTED from DORMANT', () => {
      expect(isValidTransition(LeadStates.DORMANT, LeadStates.RESURRECTED)).toBe(true)
    })

    test('RESURRECTED is transient (no outgoing transitions in matrix)', () => {
      expect(getNextStates(LeadStates.RESURRECTED).length).toBe(0)
    })
  })

  test.describe('Edge Cases', () => {
    test('cannot go backwards from QUALIFIED to NEW', () => {
      expect(isValidTransition(LeadStates.QUALIFIED, LeadStates.NEW)).toBe(false)
    })

    test('cannot skip states: QUALIFIED → INTERESTED (must go through PROPERTY_SHOWN)', () => {
      expect(isValidTransition(LeadStates.QUALIFIED, LeadStates.INTERESTED)).toBe(false)
    })

    test('invalid state returns empty next-states', () => {
      expect(getNextStates('INVALID_STATE' as LeadState).length).toBe(0)
    })

    test('cannot resurrect from terminal states', () => {
      expect(isValidTransition(LeadStates.LOST, LeadStates.RESURRECTED)).toBe(false)
      expect(isValidTransition(LeadStates.CONVERTED, LeadStates.RESURRECTED)).toBe(false)
    })
  })
})
