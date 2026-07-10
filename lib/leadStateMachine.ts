/**
 * Lead State Machine — Single authority for lead state transitions
 * 
 * Defines 17 states and enforces valid transitions with precondition guards.
 * Every transition emits an event (for Sprint 4 event log).
 * 
 * States:
 * - NEW: Lead just created
 * - IN_CONVERSATION: Bot engaged, awaiting intent signal
 * - QUALIFYING: Intent detected, gathering qualification data
 * - QUALIFIED: All qualification criteria met
 * - PROPERTY_SHOWN: Bot presented a matching property
 * - INTERESTED: Lead expressed interest in a property
 * - VISIT_REQUESTED: Lead asked to schedule a site visit
 * - AWAITING_BROKER_APPROVAL: Broker hasn't confirmed availability yet
 * - VISIT_CONFIRMED: Broker approved, visit is confirmed
 * - VISIT_COMPLETED: Lead completed the site visit
 * - CONVERTED: Lead converted to customer (terminal)
 * - INACTIVE_24H: No message for 24h
 * - INACTIVE_3D: No message for 3 days
 * - INACTIVE_7D: No message for 7 days
 * - DORMANT: No message for 14+ days
 * - RESURRECTED: Re-engaged after inactivity
 * - LOST: Lead abandoned or rejected (terminal)
 */

import { createClient } from '@supabase/supabase-js'

export const LEAD_STATES = {
  NEW: 'NEW',
  IN_CONVERSATION: 'IN_CONVERSATION',
  QUALIFYING: 'QUALIFYING',
  QUALIFIED: 'QUALIFIED',
  PROPERTY_SHOWN: 'PROPERTY_SHOWN',
  INTERESTED: 'INTERESTED',
  VISIT_REQUESTED: 'VISIT_REQUESTED',
  AWAITING_BROKER_APPROVAL: 'AWAITING_BROKER_APPROVAL',
  VISIT_CONFIRMED: 'VISIT_CONFIRMED',
  VISIT_COMPLETED: 'VISIT_COMPLETED',
  CONVERTED: 'CONVERTED',
  INACTIVE_24H: 'INACTIVE_24H',
  INACTIVE_3D: 'INACTIVE_3D',
  INACTIVE_7D: 'INACTIVE_7D',
  DORMANT: 'DORMANT',
  RESURRECTED: 'RESURRECTED',
  LOST: 'LOST',
} as const

export type LeadState = typeof LEAD_STATES[keyof typeof LEAD_STATES]

/**
 * Transition matrix: allowed next states per current state
 */
const TRANSITION_MATRIX: Record<LeadState, LeadState[]> = {
  [LEAD_STATES.NEW]: [LEAD_STATES.IN_CONVERSATION, LEAD_STATES.LOST],
  [LEAD_STATES.IN_CONVERSATION]: [
    LEAD_STATES.QUALIFYING,
    LEAD_STATES.INACTIVE_24H,
    LEAD_STATES.LOST,
  ],
  [LEAD_STATES.QUALIFYING]: [
    LEAD_STATES.QUALIFIED,
    LEAD_STATES.INACTIVE_24H,
    LEAD_STATES.LOST,
  ],
  [LEAD_STATES.QUALIFIED]: [
    LEAD_STATES.PROPERTY_SHOWN,
    LEAD_STATES.INACTIVE_24H,
    LEAD_STATES.LOST,
  ],
  [LEAD_STATES.PROPERTY_SHOWN]: [
    LEAD_STATES.INTERESTED,
    LEAD_STATES.QUALIFYING,
    LEAD_STATES.INACTIVE_24H,
    LEAD_STATES.LOST,
  ],
  [LEAD_STATES.INTERESTED]: [
    LEAD_STATES.VISIT_REQUESTED,
    LEAD_STATES.QUALIFYING,
    LEAD_STATES.INACTIVE_24H,
    LEAD_STATES.LOST,
  ],
  [LEAD_STATES.VISIT_REQUESTED]: [
    LEAD_STATES.AWAITING_BROKER_APPROVAL,
    LEAD_STATES.QUALIFYING,
    LEAD_STATES.INACTIVE_24H,
    LEAD_STATES.LOST,
  ],
  [LEAD_STATES.AWAITING_BROKER_APPROVAL]: [
    LEAD_STATES.VISIT_CONFIRMED,
    LEAD_STATES.VISIT_REQUESTED,
    LEAD_STATES.INACTIVE_24H,
    LEAD_STATES.LOST,
  ],
  [LEAD_STATES.VISIT_CONFIRMED]: [
    LEAD_STATES.VISIT_COMPLETED,
    LEAD_STATES.INACTIVE_24H,
    LEAD_STATES.LOST,
  ],
  [LEAD_STATES.VISIT_COMPLETED]: [
    LEAD_STATES.CONVERTED,
    LEAD_STATES.LOST,
    LEAD_STATES.INACTIVE_24H,
  ],
  [LEAD_STATES.CONVERTED]: [], // terminal
  [LEAD_STATES.INACTIVE_24H]: [
    LEAD_STATES.RESURRECTED,
    LEAD_STATES.INACTIVE_3D,
    LEAD_STATES.LOST,
  ],
  [LEAD_STATES.INACTIVE_3D]: [
    LEAD_STATES.RESURRECTED,
    LEAD_STATES.INACTIVE_7D,
    LEAD_STATES.LOST,
  ],
  [LEAD_STATES.INACTIVE_7D]: [
    LEAD_STATES.RESURRECTED,
    LEAD_STATES.DORMANT,
    LEAD_STATES.LOST,
  ],
  [LEAD_STATES.DORMANT]: [
    LEAD_STATES.RESURRECTED,
    LEAD_STATES.LOST,
  ],
  [LEAD_STATES.RESURRECTED]: [
    LEAD_STATES.IN_CONVERSATION,
    LEAD_STATES.QUALIFYING,
    LEAD_STATES.QUALIFIED,
    LEAD_STATES.PROPERTY_SHOWN,
  ],
  [LEAD_STATES.LOST]: [], // terminal
}

interface Lead {
  id: string
  state?: LeadState | null
  state_updated_at?: string | null
  conversation_stage?: string | null
  intent?: string | null
  area?: string | null
  budget_min?: number | null
  budget_max?: number | null
  matched_property_id?: string | null
  agent_id: string
  [key: string]: any
}

interface TransitionContext {
  intent?: string
  area?: string
  budget_min?: number
  budget_max?: number
  matched_property_id?: string
  visit_time?: string
  reason?: string
  [key: string]: any
}

/**
 * Check if a transition is allowed by the matrix
 */
export function isValidTransition(
  fromState: LeadState,
  toState: LeadState
): boolean {
  return TRANSITION_MATRIX[fromState]?.includes(toState) ?? false
}

/**
 * Get allowed next states for a given state
 */
export function getNextStates(currentState: LeadState): LeadState[] {
  return TRANSITION_MATRIX[currentState] ?? []
}

/**
 * Guard: check preconditions before transition
 * Throws if precondition not met
 */
function checkPreconditions(
  lead: Lead,
  targetState: LeadState,
  context?: TransitionContext
): void {
  switch (targetState) {
    case LEAD_STATES.QUALIFYING:
      if (!context?.intent) {
        throw new Error('Cannot move to QUALIFYING without intent')
      }
      break

    case LEAD_STATES.QUALIFIED:
      if (!lead.intent || !lead.area) {
        throw new Error(
          'Cannot move to QUALIFIED without intent and area'
        )
      }
      break

    case LEAD_STATES.PROPERTY_SHOWN:
      if (!context?.matched_property_id && !lead.matched_property_id) {
        throw new Error('Cannot move to PROPERTY_SHOWN without a matched property')
      }
      break

    case LEAD_STATES.VISIT_REQUESTED:
      if (!context?.visit_time) {
        throw new Error('Cannot move to VISIT_REQUESTED without a visit_time')
      }
      break

    case LEAD_STATES.AWAITING_BROKER_APPROVAL:
      if (lead.state !== LEAD_STATES.VISIT_REQUESTED) {
        throw new Error(
          'Can only move to AWAITING_BROKER_APPROVAL from VISIT_REQUESTED'
        )
      }
      break

    case LEAD_STATES.VISIT_CONFIRMED:
      if (lead.state !== LEAD_STATES.AWAITING_BROKER_APPROVAL) {
        throw new Error(
          'Can only move to VISIT_CONFIRMED from AWAITING_BROKER_APPROVAL'
        )
      }
      break

    default:
      break
  }
}

/**
 * Main state transition function
 * 
 * Usage:
 *   const updatedLead = await transitionLead(lead, 'QUALIFIED', { intent: 'rent', area: 'Baner' })
 */
export async function transitionLead(
  lead: Lead,
  targetState: LeadState,
  context?: TransitionContext
): Promise<Lead> {
  const currentState = lead.state || LEAD_STATES.NEW

  // Validate transition
  if (!isValidTransition(currentState as LeadState, targetState)) {
    throw new Error(
      `Invalid transition: ${currentState} → ${targetState}`
    )
  }

  // Check preconditions
  checkPreconditions(lead, targetState, context)

  // Build the updated lead object
  const updatedLead: Lead = {
    ...lead,
    state: targetState,
    state_updated_at: new Date().toISOString(),
  }

  // Merge context into lead (e.g., intent, area, budget)
  if (context) {
    Object.entries(context).forEach(([key, value]) => {
      if (value !== undefined && !key.startsWith('_')) {
        updatedLead[key] = value
      }
    })
  }

  // TODO (Sprint 4): Emit event to lead_events table
  // emitLeadEvent(lead.id, currentState, targetState, context)

  return updatedLead
}

/**
 * Get current state of a lead (with fallback to conversation_stage for backward compat)
 */
export function getCurrentState(lead: Lead): LeadState {
  if (lead.state) return lead.state as LeadState

  // Fallback to old conversation_stage column (Phase 2 dual-write period)
  if (lead.conversation_stage) {
    const legacyMap: Record<string, LeadState> = {
      new: LEAD_STATES.NEW,
      awaiting_intent: LEAD_STATES.IN_CONVERSATION,
      awaiting_area: LEAD_STATES.QUALIFYING,
      presenting: LEAD_STATES.PROPERTY_SHOWN,
      no_match_ai: LEAD_STATES.PROPERTY_SHOWN,
      awaiting_booking: LEAD_STATES.VISIT_REQUESTED,
      booked: LEAD_STATES.VISIT_CONFIRMED,
    }
    return legacyMap[lead.conversation_stage] ?? LEAD_STATES.NEW
  }

  return LEAD_STATES.NEW
}
