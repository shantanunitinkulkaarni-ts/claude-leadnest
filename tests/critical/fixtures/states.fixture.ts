/**
 * Test fixture data for state machine tests
 */

import { LeadStates } from '@/lib/leadStateMachine'

export const allLeadStates = [
  LeadStates.NEW,
  LeadStates.IN_CONVERSATION,
  LeadStates.QUALIFYING,
  LeadStates.QUALIFIED,
  LeadStates.PROPERTY_SHOWN,
  LeadStates.INTERESTED,
  LeadStates.VISIT_REQUESTED,
  LeadStates.AWAITING_BROKER_APPROVAL,
  LeadStates.VISIT_CONFIRMED,
  LeadStates.VISIT_COMPLETED,
  LeadStates.CONVERTED,
  LeadStates.LOST,
  LeadStates.INACTIVE_24H,
  LeadStates.INACTIVE_3D,
  LeadStates.INACTIVE_7D,
  LeadStates.DORMANT,
  LeadStates.RESURRECTED,
]

export const validTransitions = {
  [LeadStates.NEW]: [LeadStates.IN_CONVERSATION],
  [LeadStates.IN_CONVERSATION]: [LeadStates.QUALIFYING],
  [LeadStates.QUALIFYING]: [LeadStates.QUALIFIED],
  [LeadStates.QUALIFIED]: [LeadStates.PROPERTY_SHOWN],
  [LeadStates.PROPERTY_SHOWN]: [LeadStates.INTERESTED],
  [LeadStates.INTERESTED]: [LeadStates.VISIT_REQUESTED],
  [LeadStates.VISIT_REQUESTED]: [LeadStates.AWAITING_BROKER_APPROVAL],
  [LeadStates.AWAITING_BROKER_APPROVAL]: [LeadStates.VISIT_CONFIRMED],
  [LeadStates.VISIT_CONFIRMED]: [LeadStates.VISIT_COMPLETED],
  [LeadStates.VISIT_COMPLETED]: [LeadStates.CONVERTED, LeadStates.LOST],
}

export const inactivityStates = {
  [LeadStates.INACTIVE_24H]: [LeadStates.RESURRECTED],
  [LeadStates.INACTIVE_3D]: [LeadStates.RESURRECTED],
  [LeadStates.INACTIVE_7D]: [LeadStates.RESURRECTED],
  [LeadStates.DORMANT]: [LeadStates.RESURRECTED],
}

export const terminalStates = [
  LeadStates.CONVERTED,
  LeadStates.LOST,
]
