import type { ExtractedIntent } from '../intentExtractor'
import {
  decideConversationFlow,
  type ExtractedCustomerMeaning,
  type FlowAgentSettings,
  type FlowDecision,
  type FlowLead,
} from './flowController'

export type SimulatedTurn = {
  customer: string
  extracted: ExtractedCustomerMeaning | ExtractedIntent
  decision: FlowDecision
  leadAfter: FlowLead
}

export function meaningFromIntent(intent: ExtractedIntent): ExtractedCustomerMeaning {
  const meaning: ExtractedCustomerMeaning = {
    name: intent.name || undefined,
    language: intent.language || undefined,
    property_category: intent.property_category || undefined,
    intent: intent.intent || undefined,
    preferred_areas: intent.areas.length ? intent.areas : undefined,
    budget_min: intent.budget_min || undefined,
    budget_max: intent.budget_max || undefined,
    bhk: intent.bhk || undefined,
  }
  // Pass through size fields if the decoder captured them (aiDecoder adds these)
  const any = intent as any
  if (any.sqft_preference && typeof any.sqft_preference === 'number') {
    meaning.sqft_preference = any.sqft_preference
  }
  if (any.size_preference && typeof any.size_preference === 'string') {
    meaning.size_preference = any.size_preference
  }
  if (any.no_size_preference === true) {
    meaning.no_size_preference = true
  }
  return meaning
}

export function simulateFlowTurns(args: {
  agent: FlowAgentSettings
  lead?: FlowLead
  turns: Array<{
    customer: string
    extracted: ExtractedCustomerMeaning | ExtractedIntent
  }>
}): SimulatedTurn[] {
  let lead: FlowLead = { ...(args.lead || {}) }
  return args.turns.map(turn => {
    const extracted = normalizeMeaning(turn.extracted)
    const decision = decideConversationFlow(lead, args.agent, extracted)
    lead = { ...lead, ...decision.updates }
    return {
      customer: turn.customer,
      extracted: turn.extracted,
      decision,
      leadAfter: { ...lead },
    }
  })
}

function normalizeMeaning(input: ExtractedCustomerMeaning | ExtractedIntent): ExtractedCustomerMeaning {
  if ('areas' in input || 'message_type' in input) return meaningFromIntent(input as ExtractedIntent)
  return input as ExtractedCustomerMeaning
}
