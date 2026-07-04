import { buildPropertyBlock } from '../propertyPresenter'
import { searchPropertiesByFallbackChain, type PropertyRow } from '../propertySearch'
import { saveLeadHistory } from './conversation'
import type { AIDecision } from './types'

export type PropertySearchOutcome = {
  reply: string
  matchedPropertyId: string | null
}

export async function handlePropertySearchAction(args: {
  activeProperties: PropertyRow[]
  decision: AIDecision
  lead: any
  leadId: string
}): Promise<PropertySearchOutcome> {
  const { activeProperties, decision, lead, leadId } = args
  const intent = decision.updates?.intent || lead.intent
  const areas = decision.updates?.preferred_areas || lead.preferred_areas || []
  const budgetMax = decision.updates?.budget_max || lead.budget_max || null

  const result = searchPropertiesByFallbackChain(activeProperties, {
    intent: intent as 'rent' | 'buy',
    preferred_areas: areas,
    budget_max: budgetMax,
  })

  const wantBhk = (decision.updates?.bhk || lead.bhk || '').toLowerCase().replace(/[\s_-]+/g, '')
  if (wantBhk && !['nopreference', 'any', 'anything'].includes(wantBhk)) {
    const bhkMatches = result.properties.filter(
      (p: any) => (p.bhk || '').toLowerCase().replace(/\s+/g, '') === wantBhk
    )
    if (bhkMatches.length > 0) result.properties = bhkMatches
  }

  if (result.properties.length === 0) {
    return {
      reply: buildNoMatchReply({
        level: result.level,
        nearbyAreas: result.nearbyAreas || [],
        areas,
        intent,
      }),
      matchedPropertyId: null,
    }
  }

  const blocks = result.properties
    .slice(0, 3)
    .map(p => buildPropertyBlock(p))
    .join('\n\n-------------\n\n')
  const matchedPropertyId = result.properties[0].id

  await saveLeadHistory(leadId, { matched_property_id: matchedPropertyId })

  return {
    reply: `Here are the top matches for you:\n\n${blocks}\n\nWhich one interests you? I can share photos or arrange a site visit. 😊`,
    matchedPropertyId,
  }
}

function buildNoMatchReply(args: {
  level: string
  nearbyAreas: string[]
  areas: string[]
  intent: string | null
}) {
  const areaText = args.areas.join(', ') || 'that area'
  const intentLabel = args.intent === 'rent' ? 'rental' : 'sale'

  switch (args.level) {
    case 'no_inventory':
      return `I don't have any ${intentLabel} properties listed at the moment. Would you like me to have our team reach out to help find options for you? 😊`
    case 'nearby': {
      const nearbyText = args.nearbyAreas.length > 0
        ? `I don't have exact matches in ${areaText}, but I found some great options in nearby areas like ${args.nearbyAreas.slice(0, 3).join(', ')}. Would you like to see those?`
        : `I don't have exact matches in ${areaText}, but there are properties nearby. Would you like to explore other areas?`
      return `${nearbyText} 😊`
    }
    case 'area_no_budget':
      return `I found ${intentLabel} properties in ${areaText}, but they're above your budget range. Would you like to see them anyway, or shall I adjust the search? 😊`
    default:
      return `I looked through all our ${intentLabel} properties in ${areaText} but don't have a match right now. 😔\n\nTo serve you better, shall I schedule a call with our team? They may have options that aren't listed yet.`
  }
}
