import { describe, it, expect, beforeEach } from 'vitest'
import {
  LEAD_STATES,
  LeadState,
  isValidTransition,
  getNextStates,
  transitionLead,
  getCurrentState,
} from '../../lib/leadStateMachine'

describe('Lead State Machine', () => {
  let lead: any

  beforeEach(() => {
    lead = {
      id: 'test-lead-1',
      agent_id: 'agent-1',
      state: null,
      conversation_stage: null,
      intent: null,
      area: null,
      budget_min: null,
      budget_max: null,
      matched_property_id: null,
    }
  })

  describe('State definitions', () => {
    it('should define all 17 states', () => {
      const states = Object.keys(LEAD_STATES)
      expect(states).toHaveLength(17)
    })

    it('should have unique state names', () => {
      const values = Object.values(LEAD_STATES)
      const unique = new Set(values)
      expect(unique.size).toBe(17)
    })

    it('should export LEAD_STATES as frozen object', () => {
      expect(() => {
        ;(LEAD_STATES as any).NEW = 'MODIFIED'
      }).toThrow()
    })
  })

  describe('Transition matrix validation', () => {
    it('should allow NEW → IN_CONVERSATION', () => {
      expect(
        isValidTransition(
          LEAD_STATES.NEW,
          LEAD_STATES.IN_CONVERSATION
        )
      ).toBe(true)
    })

    it('should allow IN_CONVERSATION → QUALIFYING', () => {
      expect(
        isValidTransition(
          LEAD_STATES.IN_CONVERSATION,
          LEAD_STATES.QUALIFYING
        )
      ).toBe(true)
    })

    it('should allow QUALIFYING → QUALIFIED', () => {
      expect(
        isValidTransition(
          LEAD_STATES.QUALIFYING,
          LEAD_STATES.QUALIFIED
        )
      ).toBe(true)
    })

    it('should allow QUALIFIED → PROPERTY_SHOWN', () => {
      expect(
        isValidTransition(
          LEAD_STATES.QUALIFIED,
          LEAD_STATES.PROPERTY_SHOWN
        )
      ).toBe(true)
    })

    it('should allow PROPERTY_SHOWN → INTERESTED', () => {
      expect(
        isValidTransition(
          LEAD_STATES.PROPERTY_SHOWN,
          LEAD_STATES.INTERESTED
        )
      ).toBe(true)
    })

    it('should allow INTERESTED → VISIT_REQUESTED', () => {
      expect(
        isValidTransition(
          LEAD_STATES.INTERESTED,
          LEAD_STATES.VISIT_REQUESTED
        )
      ).toBe(true)
    })

    it('should allow VISIT_REQUESTED → AWAITING_BROKER_APPROVAL', () => {
      expect(
        isValidTransition(
          LEAD_STATES.VISIT_REQUESTED,
          LEAD_STATES.AWAITING_BROKER_APPROVAL
        )
      ).toBe(true)
    })

    it('should allow AWAITING_BROKER_APPROVAL → VISIT_CONFIRMED', () => {
      expect(
        isValidTransition(
          LEAD_STATES.AWAITING_BROKER_APPROVAL,
          LEAD_STATES.VISIT_CONFIRMED
        )
      ).toBe(true)
    })

    it('should allow VISIT_CONFIRMED → VISIT_COMPLETED', () => {
      expect(
        isValidTransition(
          LEAD_STATES.VISIT_CONFIRMED,
          LEAD_STATES.VISIT_COMPLETED
        )
      ).toBe(true)
    })

    it('should allow VISIT_COMPLETED → CONVERTED', () => {
      expect(
        isValidTransition(
          LEAD_STATES.VISIT_COMPLETED,
          LEAD_STATES.CONVERTED
        )
      ).toBe(true)
    })

    it('should reject invalid transition (CONVERTED → anything)', () => {
      expect(
        isValidTransition(
          LEAD_STATES.CONVERTED,
          LEAD_STATES.IN_CONVERSATION
        )
      ).toBe(false)
    })

    it('should reject invalid transition (LOST → anything)', () => {
      expect(
        isValidTransition(LEAD_STATES.LOST, LEAD_STATES.IN_CONVERSATION)
      ).toBe(false)
    })
  })

  describe('Inactivity ladder', () => {
    it('should allow QUALIFIED → INACTIVE_24H', () => {
      expect(
        isValidTransition(
          LEAD_STATES.QUALIFIED,
          LEAD_STATES.INACTIVE_24H
        )
      ).toBe(true)
    })

    it('should allow INACTIVE_24H → INACTIVE_3D', () => {
      expect(
        isValidTransition(
          LEAD_STATES.INACTIVE_24H,
          LEAD_STATES.INACTIVE_3D
        )
      ).toBe(true)
    })

    it('should allow INACTIVE_3D → INACTIVE_7D', () => {
      expect(
        isValidTransition(
          LEAD_STATES.INACTIVE_3D,
          LEAD_STATES.INACTIVE_7D
        )
      ).toBe(true)
    })

    it('should allow INACTIVE_7D → DORMANT', () => {
      expect(
        isValidTransition(
          LEAD_STATES.INACTIVE_7D,
          LEAD_STATES.DORMANT
        )
      ).toBe(true)
    })

    it('should allow INACTIVE_24H → RESURRECTED', () => {
      expect(
        isValidTransition(
          LEAD_STATES.INACTIVE_24H,
          LEAD_STATES.RESURRECTED
        )
      ).toBe(true)
    })

    it('should allow DORMANT → RESURRECTED', () => {
      expect(
        isValidTransition(
          LEAD_STATES.DORMANT,
          LEAD_STATES.RESURRECTED
        )
      ).toBe(true)
    })

    it('should allow RESURRECTED → IN_CONVERSATION', () => {
      expect(
        isValidTransition(
          LEAD_STATES.RESURRECTED,
          LEAD_STATES.IN_CONVERSATION
        )
      ).toBe(true)
    })
  })

  describe('Precondition guards', () => {
    it('should throw when moving to QUALIFYING without intent', async () => {
      lead.state = LEAD_STATES.IN_CONVERSATION
      await expect(
        transitionLead(lead, LEAD_STATES.QUALIFYING, {})
      ).rejects.toThrow('Cannot move to QUALIFYING without intent')
    })

    it('should throw when moving to QUALIFIED without intent and area', async () => {
      lead.state = LEAD_STATES.QUALIFYING
      await expect(
        transitionLead(lead, LEAD_STATES.QUALIFIED, {})
      ).rejects.toThrow('Cannot move to QUALIFIED without intent and area')
    })

    it('should throw when moving to PROPERTY_SHOWN without matched property', async () => {
      lead.state = LEAD_STATES.QUALIFIED
      await expect(
        transitionLead(lead, LEAD_STATES.PROPERTY_SHOWN, {})
      ).rejects.toThrow(
        'Cannot move to PROPERTY_SHOWN without a matched property'
      )
    })

    it('should throw when moving to VISIT_REQUESTED without visit_time', async () => {
      lead.state = LEAD_STATES.INTERESTED
      await expect(
        transitionLead(lead, LEAD_STATES.VISIT_REQUESTED, {})
      ).rejects.toThrow('Cannot move to VISIT_REQUESTED without a visit_time')
    })

    it('should throw when moving to VISIT_CONFIRMED from wrong state', async () => {
      lead.state = LEAD_STATES.VISIT_REQUESTED
      await expect(
        transitionLead(lead, LEAD_STATES.VISIT_CONFIRMED, {})
      ).rejects.toThrow(
        'Can only move to VISIT_CONFIRMED from AWAITING_BROKER_APPROVAL'
      )
    })
  })

  describe('transitionLead function', () => {
    it('should transition from NEW to IN_CONVERSATION', async () => {
      lead.state = LEAD_STATES.NEW
      const updated = await transitionLead(
        lead,
        LEAD_STATES.IN_CONVERSATION
      )
      expect(updated.state).toBe(LEAD_STATES.IN_CONVERSATION)
      expect(updated.state_updated_at).toBeDefined()
    })

    it('should set state_updated_at timestamp', async () => {
      lead.state = LEAD_STATES.NEW
      const before = new Date().toISOString()
      const updated = await transitionLead(
        lead,
        LEAD_STATES.IN_CONVERSATION
      )
      const after = new Date().toISOString()

      expect(updated.state_updated_at).toBeDefined()
      const ts = new Date(updated.state_updated_at!)
      expect(ts.getTime()).toBeGreaterThanOrEqual(new Date(before).getTime())
      expect(ts.getTime()).toBeLessThanOrEqual(new Date(after).getTime())
    })

    it('should merge context into updated lead', async () => {
      lead.state = LEAD_STATES.IN_CONVERSATION
      const updated = await transitionLead(
        lead,
        LEAD_STATES.QUALIFYING,
        { intent: 'rent', area: 'Baner', budget_max: 50000 }
      )
      expect(updated.intent).toBe('rent')
      expect(updated.area).toBe('Baner')
      expect(updated.budget_max).toBe(50000)
    })

    it('should preserve original lead properties', async () => {
      lead.state = LEAD_STATES.NEW
      lead.agent_id = 'agent-123'
      const updated = await transitionLead(
        lead,
        LEAD_STATES.IN_CONVERSATION
      )
      expect(updated.agent_id).toBe('agent-123')
    })

    it('should be idempotent on second call with same state', async () => {
      lead.state = LEAD_STATES.NEW
      const first = await transitionLead(
        lead,
        LEAD_STATES.IN_CONVERSATION
      )
      const second = await transitionLead(
        first,
        LEAD_STATES.IN_CONVERSATION
      )
      expect(second.state).toBe(first.state)
    })
  })

  describe('getCurrentState function', () => {
    it('should return state from state column', () => {
      lead.state = LEAD_STATES.QUALIFIED
      const state = getCurrentState(lead)
      expect(state).toBe(LEAD_STATES.QUALIFIED)
    })

    it('should fallback to conversation_stage if state is null', () => {
      lead.state = null
      lead.conversation_stage = 'presenting'
      const state = getCurrentState(lead)
      expect(state).toBe(LEAD_STATES.PROPERTY_SHOWN)
    })

    it('should return NEW if both state and conversation_stage are null', () => {
      lead.state = null
      lead.conversation_stage = null
      const state = getCurrentState(lead)
      expect(state).toBe(LEAD_STATES.NEW)
    })

    it('should map conversation_stage "booked" to VISIT_CONFIRMED', () => {
      lead.state = null
      lead.conversation_stage = 'booked'
      const state = getCurrentState(lead)
      expect(state).toBe(LEAD_STATES.VISIT_CONFIRMED)
    })
  })

  describe('getNextStates function', () => {
    it('should return allowed next states for NEW', () => {
      const next = getNextStates(LEAD_STATES.NEW)
      expect(next).toContain(LEAD_STATES.IN_CONVERSATION)
      expect(next).toContain(LEAD_STATES.LOST)
    })

    it('should return allowed next states for QUALIFIED', () => {
      const next = getNextStates(LEAD_STATES.QUALIFIED)
      expect(next).toContain(LEAD_STATES.PROPERTY_SHOWN)
      expect(next).toContain(LEAD_STATES.INACTIVE_24H)
    })

    it('should return empty array for terminal states', () => {
      expect(getNextStates(LEAD_STATES.CONVERTED)).toHaveLength(0)
      expect(getNextStates(LEAD_STATES.LOST)).toHaveLength(0)
    })
  })

  describe('Full funnel integration', () => {
    it('should transition through entire happy path', async () => {
      let current = lead
      current.state = LEAD_STATES.NEW

      // NEW → IN_CONVERSATION
      current = await transitionLead(
        current,
        LEAD_STATES.IN_CONVERSATION
      )
      expect(current.state).toBe(LEAD_STATES.IN_CONVERSATION)

      // IN_CONVERSATION → QUALIFYING
      current = await transitionLead(
        current,
        LEAD_STATES.QUALIFYING,
        { intent: 'rent' }
      )
      expect(current.state).toBe(LEAD_STATES.QUALIFYING)

      // QUALIFYING → QUALIFIED
      current = await transitionLead(
        current,
        LEAD_STATES.QUALIFIED,
        { area: 'Baner' }
      )
      expect(current.state).toBe(LEAD_STATES.QUALIFIED)

      // QUALIFIED → PROPERTY_SHOWN
      current = await transitionLead(
        current,
        LEAD_STATES.PROPERTY_SHOWN,
        { matched_property_id: 'prop-1' }
      )
      expect(current.state).toBe(LEAD_STATES.PROPERTY_SHOWN)

      // PROPERTY_SHOWN → INTERESTED
      current = await transitionLead(
        current,
        LEAD_STATES.INTERESTED
      )
      expect(current.state).toBe(LEAD_STATES.INTERESTED)

      // INTERESTED → VISIT_REQUESTED
      current = await transitionLead(
        current,
        LEAD_STATES.VISIT_REQUESTED,
        { visit_time: '2026-07-15T14:00:00Z' }
      )
      expect(current.state).toBe(LEAD_STATES.VISIT_REQUESTED)

      // VISIT_REQUESTED → AWAITING_BROKER_APPROVAL
      current = await transitionLead(
        current,
        LEAD_STATES.AWAITING_BROKER_APPROVAL
      )
      expect(current.state).toBe(LEAD_STATES.AWAITING_BROKER_APPROVAL)

      // AWAITING_BROKER_APPROVAL → VISIT_CONFIRMED
      current = await transitionLead(
        current,
        LEAD_STATES.VISIT_CONFIRMED
      )
      expect(current.state).toBe(LEAD_STATES.VISIT_CONFIRMED)

      // VISIT_CONFIRMED → VISIT_COMPLETED
      current = await transitionLead(
        current,
        LEAD_STATES.VISIT_COMPLETED
      )
      expect(current.state).toBe(LEAD_STATES.VISIT_COMPLETED)

      // VISIT_COMPLETED → CONVERTED
      current = await transitionLead(
        current,
        LEAD_STATES.CONVERTED
      )
      expect(current.state).toBe(LEAD_STATES.CONVERTED)
    })

    it('should transition through inactivity ladder', async () => {
      let current = lead
      current.state = LEAD_STATES.QUALIFIED

      current = await transitionLead(
        current,
        LEAD_STATES.INACTIVE_24H
      )
      expect(current.state).toBe(LEAD_STATES.INACTIVE_24H)

      current = await transitionLead(
        current,
        LEAD_STATES.INACTIVE_3D
      )
      expect(current.state).toBe(LEAD_STATES.INACTIVE_3D)

      current = await transitionLead(
        current,
        LEAD_STATES.INACTIVE_7D
      )
      expect(current.state).toBe(LEAD_STATES.INACTIVE_7D)

      current = await transitionLead(
        current,
        LEAD_STATES.DORMANT
      )
      expect(current.state).toBe(LEAD_STATES.DORMANT)

      current = await transitionLead(
        current,
        LEAD_STATES.RESURRECTED
      )
      expect(current.state).toBe(LEAD_STATES.RESURRECTED)

      // RESURRECTED can go back to IN_CONVERSATION
      current = await transitionLead(
        current,
        LEAD_STATES.IN_CONVERSATION
      )
      expect(current.state).toBe(LEAD_STATES.IN_CONVERSATION)
    })
  })
})
