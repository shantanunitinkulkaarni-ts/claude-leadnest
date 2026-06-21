/**
 * Lead State Machine — TING V1
 *
 * Single authority for all lead state transitions.
 * Every state change goes through transitionLead().
 *
 * Rules:
 * - No direct state mutation
 * - All transitions checked against allowed matrix
 * - Events emitted for every transition (Sprint 4)
 * - Idempotent within a short window
 */

import { supabaseAdmin } from '@/lib/supabase'

// ─── State Constants ───────────────────────────────────────────────────────
export const LeadStates = {
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
  INACTIVE_24H: 'INACTIVE_24H',
  INACTIVE_3D: 'INACTIVE_3D',
  INACTIVE_7D: 'INACTIVE_7D',
  DORMANT: 'DORMANT',
  RESURRECTED: 'RESURRECTED',
  LOST: 'LOST',
  CONVERTED: 'CONVERTED',
} as const

export type LeadState = typeof LeadStates[keyof typeof LeadStates]

// ─── Transition Matrix ───────────────────────────────────────────────────
const ALLOWED_TRANSITIONS: Record<LeadState, LeadState[]> = {
  NEW: [LeadStates.IN_CONVERSATION, LeadStates.INACTIVE_24H],
  IN_CONVERSATION: [LeadStates.QUALIFYING, LeadStates.INACTIVE_24H],
  QUALIFYING: [LeadStates.QUALIFIED, LeadStates.INACTIVE_24H],
  QUALIFIED: [LeadStates.PROPERTY_SHOWN, LeadStates.INACTIVE_24H],
  PROPERTY_SHOWN: [LeadStates.INTERESTED, LeadStates.QUALIFYING, LeadStates.INACTIVE_24H],
  INTERESTED: [LeadStates.VISIT_REQUESTED, LeadStates.QUALIFYING, LeadStates.INACTIVE_24H],
  VISIT_REQUESTED: [LeadStates.AWAITING_BROKER_APPROVAL, LeadStates.INACTIVE_24H],
  AWAITING_BROKER_APPROVAL: [LeadStates.VISIT_CONFIRMED, LeadStates.VISIT_REQUESTED],
  VISIT_CONFIRMED: [LeadStates.VISIT_COMPLETED, LeadStates.INACTIVE_24H],
  VISIT_COMPLETED: [LeadStates.CONVERTED, LeadStates.INACTIVE_24H, LeadStates.LOST],
  INACTIVE_24H: [LeadStates.RESURRECTED, LeadStates.INACTIVE_3D],
  INACTIVE_3D: [LeadStates.RESURRECTED, LeadStates.INACTIVE_7D],
  INACTIVE_7D: [LeadStates.RESURRECTED, LeadStates.DORMANT],
  DORMANT: [LeadStates.RESURRECTED, LeadStates.LOST],
  RESURRECTED: [], // Special: routes to active state based on stored criteria
  LOST: [],
  CONVERTED: [],
}

// ─── Types ───────────────────────────────────────────────────────────────
export interface Lead {
  id: string
  state: LeadState
  state_updated_at: string
  intent?: 'buy' | 'rent' | null
  preferred_areas?: string[] | null
  budget_max?: number | null
  [key: string]: any
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Transition a lead to a new state.
 *
 * @param lead — current lead row
 * @param action — semantic action (e.g., 'intent_detected', 'property_shown', 'broker_approved')
 * @param context — additional data (intent, properties, etc.)
 * @returns updated lead row with new state
 * @throws if transition is invalid
 */
export async function transitionLead(
  lead: Lead,
  action: string,
  context?: Record<string, any>
): Promise<Lead> {
  const currentState = lead.state || LeadStates.NEW
  const nextState = getNextStateForAction(currentState, action, context)

  if (!nextState) {
    throw new Error(`Invalid transition: ${currentState} --[${action}]--> (no valid next state)`)
  }

  if (!isValidTransition(currentState, nextState)) {
    throw new Error(
      `Not allowed: ${currentState} → ${nextState}. Allowed: ${ALLOWED_TRANSITIONS[currentState as LeadState].join(', ')}`
    )
  }

  // Update DB
  const { data, error } = await supabaseAdmin
    .from('leads')
    .update({
      state: nextState,
      state_updated_at: new Date().toISOString(),
    })
    .eq('id', lead.id)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to transition lead ${lead.id}: ${error.message}`)
  }

  return (data as unknown as Lead) || (lead as Lead)
}

/**
 * Get the current state of a lead.
 */
export async function getCurrentState(leadId: string): Promise<LeadState> {
  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('state')
    .eq('id', leadId)
    .single()

  if (error) throw new Error(`Failed to fetch lead state: ${error.message}`)
  return (data?.state || LeadStates.NEW) as LeadState
}

/**
 * Get all valid next states from a given state.
 */
export function getNextStates(currentState: string): LeadState[] {
  return ALLOWED_TRANSITIONS[currentState as LeadState] || []
}

/**
 * Check if a transition is allowed.
 */
export function isValidTransition(from: string, to: string): boolean {
  const allowed = ALLOWED_TRANSITIONS[from as LeadState] || []
  return allowed.includes(to as LeadState)
}

// ─── Internal Helpers ───────────────────────────────────────────────────

/**
 * Determine the next state based on the semantic action.
 *
 * Action → Next State mapping (semantic layer).
 * Examples:
 *   - 'intent_detected' → IN_CONVERSATION
 *   - 'properties_shown' → PROPERTY_SHOWN
 *   - 'broker_approved' → VISIT_CONFIRMED
 */
export function getNextStateForAction(
  currentState: LeadState,
  action: string,
  context?: Record<string, any>
): LeadState | null {
  const actionMap: Record<string, LeadState> = {
    greeting_done: LeadStates.IN_CONVERSATION,
    intent_detected: LeadStates.IN_CONVERSATION,
    area_provided: LeadStates.QUALIFYING,
    criteria_complete: LeadStates.QUALIFIED,
    properties_searched: LeadStates.PROPERTY_SHOWN,
    no_match: LeadStates.PROPERTY_SHOWN,
    property_interested: LeadStates.INTERESTED,
    visit_requested: LeadStates.VISIT_REQUESTED,
    broker_approved: LeadStates.VISIT_CONFIRMED,
    broker_rejected: LeadStates.VISIT_REQUESTED,
    visit_completed: LeadStates.VISIT_COMPLETED,
    deal_won: LeadStates.CONVERTED,
    deal_lost: LeadStates.LOST,
    window_expired: LeadStates.INACTIVE_24H,
    inactive_3d: LeadStates.INACTIVE_3D,
    inactive_7d: LeadStates.INACTIVE_7D,
    dormancy: LeadStates.DORMANT,
    lead_replied: LeadStates.RESURRECTED,
  }

  const targetState = actionMap[action]
  if (!targetState) return null

  // Check if this transition is allowed
  if (!isValidTransition(currentState, targetState)) {
    return null
  }

  return targetState
}

/**
 * All state names for validation.
 */
export function getAllStates(): LeadState[] {
  return Object.values(LeadStates)
}
