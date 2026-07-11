import type { ExtractedIntent } from '../intentExtractor'
import { detectLanguageSwitchRequest } from '../timeParser'
import { aiDecoder } from './aiDecoder'
import {
  decideConversationFlow,
  type FlowAgentSettings,
  type FlowDecision,
  type FlowLead,
} from './flowController'
import type { ExtractedCustomerMeaning } from './flowController'

export type FlowRunnerResult = {
  extracted: ExtractedIntent
  decision: FlowDecision
}

export async function runConversationFlowStep(
  args: {
    agent: FlowAgentSettings
    lead: FlowLead
    message: string
    recent?: { role: 'user' | 'assistant'; content: string }[]
  },
  deps: {
    decoder?: typeof aiDecoder
  } = {},
): Promise<FlowRunnerResult> {
  const decoder = deps.decoder || aiDecoder
  const extracted = await decoder(args.message, {
    recent: args.recent,
    known: {
      name: args.lead.name || null,
      intent: args.lead.intent || null,
      areas: args.lead.preferred_areas || [],
      budget_max: args.lead.budget_max || null,
      property_category: args.lead.property_category || null,
      bhk: args.lead.bhk || null,
      language: normalizedKnownLanguage(args.lead.language),
    },
  })

  const meaning: ExtractedCustomerMeaning = {
    name: extracted.name || undefined,
    language: extracted.language || undefined,
    property_category: extracted.property_category || undefined,
    intent: extracted.intent || undefined,
    preferred_areas: extracted.areas.length ? extracted.areas : undefined,
    budget_min: extracted.budget_min || undefined,
    budget_max: extracted.budget_max || undefined,
    bhk: extracted.bhk || undefined,
  }
  const requestedLanguage = detectLanguageSwitchRequest(args.message)
  if (requestedLanguage) meaning.language = requestedLanguage

  const decision = decideConversationFlow(args.lead, args.agent, meaning)
  return { extracted, decision }
}

function normalizedKnownLanguage(language?: string | null): ExtractedIntent['language'] {
  const value = String(language || '').toLowerCase()
  if (value === 'en' || value.startsWith('eng')) return 'english'
  if (value === 'hi' || value.startsWith('hin')) return 'hindi'
  if (value === 'mr' || value.startsWith('mar')) return 'marathi'
  return null
}
