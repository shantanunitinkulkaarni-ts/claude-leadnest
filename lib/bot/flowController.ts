import type { BotStage } from './types'

export type PropertyKind =
  | 'apartment'
  | 'independent_house'
  | 'row_house'
  | 'office'
  | 'shop'
  | 'plot'

export type DealType = 'buy' | 'rent'

export type FlowLead = {
  language?: string | null
  name?: string | null
  property_category?: string | null
  intent?: DealType | null
  preferred_areas?: string[] | null
  budget_min?: number | null
  budget_max?: number | null
  bhk?: string | null
  sqft_preference?: number | null
  size_preference?: string | null
  no_size_preference?: boolean | null
}

export type FlowAgentSettings = {
  agency_name?: string | null
  plan?: string | null
  languages?: string[] | null
  property_types?: string[] | null
  deal_types?: DealType[] | null
}

export type ExtractedCustomerMeaning = Partial<FlowLead> & {
  area_confidence?: 'high' | 'medium' | 'low'
  clarification?: {
    field: 'language' | 'name' | 'property_category' | 'intent' | 'area' | 'budget' | 'size'
    suggestion?: string | null
  } | null
}

export type FlowDecision = {
  stage: BotStage
  nextStep:
    | 'ask_language'
    | 'ask_name'
    | 'ask_property_type'
    | 'ask_intent'
    | 'ask_area'
    | 'ask_budget'
    | 'ask_size'
    | 'clarify'
    | 'ready_to_search'
  reply: string
  updates: Partial<FlowLead>
  mergedLead: FlowLead
  readyToSearch: boolean
}

const DEFAULT_LANGUAGES = ['English', 'Hindi', 'Marathi']
const DEFAULT_PROPERTY_TYPES = ['Apartment', 'Independent house', 'Row house', 'Office', 'Shop', 'Plot']
const DEFAULT_DEAL_TYPES: DealType[] = ['buy', 'rent']

const PROPERTY_ALIASES: Record<PropertyKind, string[]> = {
  apartment: ['apartment', 'flat', 'flats'],
  independent_house: ['independent house', 'house', 'bungalow'],
  row_house: ['row house', 'rowhouse'],
  office: ['office', 'commercial office'],
  shop: ['shop', 'retail', 'showroom'],
  plot: ['plot', 'land'],
}

const PROPERTY_LABELS: Record<PropertyKind, string> = {
  apartment: 'apartment',
  independent_house: 'independent house',
  row_house: 'row house',
  office: 'office',
  shop: 'shop',
  plot: 'plot',
}

export function decideConversationFlow(
  lead: FlowLead,
  agent: FlowAgentSettings,
  meaning: ExtractedCustomerMeaning = {},
): FlowDecision {
  const updates = buildUpdates(lead, meaning)
  const mergedLead: FlowLead = { ...lead, ...updates }

  if (meaning.clarification) {
    return decision('qualifying', 'clarify', clarificationReply(meaning.clarification), updates, mergedLead, false)
  }

  const languages = cleanList(agent.languages, DEFAULT_LANGUAGES)
  const propertyTypes = enabledPropertyTypes(agent.property_types)
  const dealTypes = enabledDealTypes(agent.deal_types)

  if (!hasText(mergedLead.language)) {
    return decision('language', 'ask_language', languageQuestion(agent, languages), updates, mergedLead, false)
  }

  if (!hasText(mergedLead.name)) {
    return decision('name', 'ask_name', 'Great, I will continue in your preferred language. May I know your name?', updates, mergedLead, false)
  }

  if (!hasText(mergedLead.property_category)) {
    return decision('qualifying', 'ask_property_type', propertyTypeQuestion(propertyTypes), updates, mergedLead, false)
  }

  if (needsIntent(mergedLead.property_category, dealTypes) && !mergedLead.intent) {
    return decision('intent', 'ask_intent', dealTypeQuestion(dealTypes), updates, mergedLead, false)
  }

  if (!hasArea(mergedLead)) {
    return decision('qualifying', 'ask_area', 'Which area are you looking in?', updates, mergedLead, false)
  }

  if (!hasBudget(mergedLead)) {
    return decision('qualifying', 'ask_budget', budgetQuestion(mergedLead.intent), updates, mergedLead, false)
  }

  if (!hasSizePreference(mergedLead)) {
    return decision('qualifying', 'ask_size', sizeQuestion(mergedLead.property_category), updates, mergedLead, false)
  }

  return decision('property_shown', 'ready_to_search', changeAcknowledgement(lead, mergedLead), updates, mergedLead, true)
}

function buildUpdates(lead: FlowLead, meaning: ExtractedCustomerMeaning): Partial<FlowLead> {
  const updates: Partial<FlowLead> = {}
  if (hasText(meaning.language) && meaning.language !== lead.language) updates.language = meaning.language
  if (hasText(meaning.name) && meaning.name !== lead.name) updates.name = meaning.name
  const property = normalizePropertyKind(meaning.property_category)
  if (property && property !== lead.property_category) updates.property_category = property
  if (meaning.intent === 'buy' || meaning.intent === 'rent') updates.intent = meaning.intent
  if (meaning.preferred_areas?.length) updates.preferred_areas = meaning.preferred_areas
  if (typeof meaning.budget_min === 'number' && meaning.budget_min > 0) updates.budget_min = Math.round(meaning.budget_min)
  if (typeof meaning.budget_max === 'number' && meaning.budget_max > 0) updates.budget_max = Math.round(meaning.budget_max)
  if (hasText(meaning.bhk)) updates.bhk = meaning.bhk
  if (typeof meaning.sqft_preference === 'number' && meaning.sqft_preference > 0) updates.sqft_preference = Math.round(meaning.sqft_preference)
  if (hasText(meaning.size_preference)) updates.size_preference = meaning.size_preference
  if (meaning.no_size_preference) updates.no_size_preference = true
  return updates
}

function decision(
  stage: BotStage,
  nextStep: FlowDecision['nextStep'],
  reply: string,
  updates: Partial<FlowLead>,
  mergedLead: FlowLead,
  readyToSearch: boolean,
): FlowDecision {
  return { stage, nextStep, reply, updates, mergedLead, readyToSearch }
}

function languageQuestion(agent: FlowAgentSettings, languages: string[]): string {
  const isTier2 = ['tier2', 't2', 'pro', 'paid_t2'].includes(String(agent.plan || '').toLowerCase())
  if (isTier2) return `Hi, welcome to ${agent.agency_name || 'our team'}. You can reply in any Indian language you are comfortable with.`
  return `Hi, welcome to ${agent.agency_name || 'our team'}. Which language do you prefer: ${joinOptions(languages)}?`
}

function propertyTypeQuestion(propertyTypes: PropertyKind[]): string {
  return `What type of property are you looking for: ${joinOptions(propertyTypes.map(type => PROPERTY_LABELS[type]))}?`
}

function dealTypeQuestion(dealTypes: DealType[]): string {
  if (dealTypes.length === 1) return ''
  return `Are you looking to ${joinOptions(dealTypes)}?`
}

function budgetQuestion(intent?: DealType | null): string {
  if (intent === 'rent') return 'What monthly rent range are you comfortable with?'
  if (intent === 'buy') return 'What total purchase budget range are you comfortable with?'
  return 'What budget range are you comfortable with?'
}

function sizeQuestion(propertyCategory?: string | null): string {
  switch (propertyCategory) {
    case 'office':
    case 'shop':
      return 'How much carpet area or size do you need?'
    case 'plot':
      return 'What plot size are you looking for?'
    default:
      return 'How many bedrooms are you looking for? You can also say no preference.'
  }
}

function clarificationReply(clarification: NonNullable<ExtractedCustomerMeaning['clarification']>): string {
  if (clarification.suggestion) return `Just to confirm, did you mean ${clarification.suggestion}?`
  return 'Could you please clarify that once?'
}

function changeAcknowledgement(previous: FlowLead, current: FlowLead): string {
  const changedArea = JSON.stringify(previous.preferred_areas || []) !== JSON.stringify(current.preferred_areas || [])
  const changedBudget = previous.budget_min !== current.budget_min || previous.budget_max !== current.budget_max
  if (changedArea || changedBudget) {
    const area = current.preferred_areas?.[0]
    const budget = current.budget_max ? ` within Rs ${current.budget_max.toLocaleString('en-IN')}` : ''
    return `Got it, I will now search${area ? ` in ${area}` : ''}${budget}.`
  }
  return 'Great, I have the basic details. I will search matching properties now.'
}

function needsIntent(propertyCategory?: string | null, dealTypes: DealType[] = DEFAULT_DEAL_TYPES): boolean {
  if (dealTypes.length <= 1) return false
  return propertyCategory !== 'plot'
}

function hasArea(lead: FlowLead): boolean {
  return Array.isArray(lead.preferred_areas) && lead.preferred_areas.some(hasText)
}

function hasBudget(lead: FlowLead): boolean {
  return !!((lead.budget_min && lead.budget_min > 0) || (lead.budget_max && lead.budget_max > 0))
}

function hasSizePreference(lead: FlowLead): boolean {
  if (lead.no_size_preference) return true
  if (hasText(lead.bhk)) return true
  if (hasText(lead.size_preference)) return true
  return !!(lead.sqft_preference && lead.sqft_preference > 0)
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function cleanList(value: string[] | null | undefined, fallback: string[]): string[] {
  const list = (value || []).map(v => String(v || '').trim()).filter(Boolean)
  return list.length ? list : fallback
}

function enabledDealTypes(value: DealType[] | null | undefined): DealType[] {
  const list = (value || []).filter(v => v === 'buy' || v === 'rent')
  return list.length ? Array.from(new Set(list)) : DEFAULT_DEAL_TYPES
}

function enabledPropertyTypes(value: string[] | null | undefined): PropertyKind[] {
  const normalized = cleanList(value, DEFAULT_PROPERTY_TYPES)
    .map(normalizePropertyKind)
    .filter((v): v is PropertyKind => !!v)
  return normalized.length ? Array.from(new Set(normalized)) : DEFAULT_PROPERTY_TYPES.map(v => normalizePropertyKind(v)!)
}

function normalizePropertyKind(value?: string | null): PropertyKind | null {
  if (!hasText(value)) return null
  const normalized = value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  for (const [kind, aliases] of Object.entries(PROPERTY_ALIASES) as [PropertyKind, string[]][]) {
    if (aliases.includes(normalized)) return kind
  }
  return null
}

function joinOptions(values: string[]): string {
  if (values.length <= 1) return values[0] || ''
  if (values.length === 2) return `${values[0]} or ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, or ${values[values.length - 1]}`
}
