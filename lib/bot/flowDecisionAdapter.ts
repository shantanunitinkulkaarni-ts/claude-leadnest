import type { FlowAgentSettings, FlowDecision, FlowLead } from './flowController'
import type { AIDecision, ChatEntry } from './types'

export function shouldUseConversationFlow(args: {
  lead: any
  extractedMessageType?: string | null
  existingAppointment?: any
}): boolean {
  const { lead, extractedMessageType, existingAppointment } = args
  if (existingAppointment || lead.pending_appointment_time || lead.matched_property_id) return false
  if (['wants_human', 'wants_photos', 'booking_request', 'objection'].includes(extractedMessageType || '')) return false
  if (['visit_booked', 'visit_done', 'closed_won', 'closed_lost', 'lost'].includes(String(lead.status || '').toLowerCase())) return false
  return true
}

export function flowDecisionToAiDecision(flow: FlowDecision): AIDecision {
  const updates: AIDecision['updates'] = {}
  if (flow.updates.name) updates.name = flow.updates.name
  if (flow.updates.language) updates.language = flow.updates.language
  if (flow.updates.intent) updates.intent = flow.updates.intent
  if (flow.updates.property_category) updates.property_category = flow.updates.property_category
  if (flow.updates.preferred_areas?.length) updates.preferred_areas = flow.updates.preferred_areas
  if (flow.updates.budget_min) updates.budget_min = flow.updates.budget_min
  if (flow.updates.budget_max) updates.budget_max = flow.updates.budget_max
  if (flow.updates.bhk) updates.bhk = flow.updates.bhk
  if (flow.updates.sqft_preference) updates.sqft_preference = flow.updates.sqft_preference

  return {
    stage: flow.stage,
    reply: flow.reply,
    action: flow.readyToSearch ? 'search_properties' : null,
    updates,
  }
}

export function leadToFlowLead(lead: any): FlowLead {
  return {
    language: lead.language || null,
    name: lead.name || null,
    property_category: lead.property_category || null,
    intent: lead.intent || null,
    preferred_areas: Array.isArray(lead.preferred_areas) ? lead.preferred_areas : [],
    budget_min: lead.budget_min ? Number(lead.budget_min) : null,
    budget_max: lead.budget_max ? Number(lead.budget_max) : null,
    bhk: lead.bhk || null,
    sqft_preference: lead.sqft_preference ? Number(lead.sqft_preference) : null,
  }
}

export function agentToFlowSettings(agent: any): FlowAgentSettings {
  return {
    agency_name: agent.agency_name || agent.name || null,
    plan: agent.plan || null,
    languages: Array.isArray(agent.languages) ? agent.languages : null,
    property_types: Array.isArray(agent.property_types) ? agent.property_types : null,
    deal_types: ['buy', 'rent'],
  }
}

export function historyToFlowRecent(history: ChatEntry[]) {
  return history.slice(-8).map(entry => ({
    role: entry.role === 'bot' ? 'assistant' as const : 'user' as const,
    content: entry.text,
  }))
}
