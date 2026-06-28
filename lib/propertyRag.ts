import { searchPropertiesByFallbackChain, type PropertyRow, type SearchCriteria } from './propertySearch'
import { excludeSampleProperties } from './propertyVisibility'

type RagOptions = {
  agentName?: string
  agencyName?: string
  limit?: number
}

export type PropertyRagSnapshot = {
  generated_at: string
  agency_name?: string
  agent_name?: string
  counts: {
    active: number
    rentals: number
    sales: number
  }
  selected_property_ids: string[]
  markdown: string
}

function moneyLabel(row: PropertyRow): string {
  const value = row.type === 'rental' ? row.rent_per_month : row.price
  if (!value) return 'Price on request'
  const prefix = row.type === 'rental' ? '₹' : '₹'
  return row.type === 'rental'
    ? `${prefix}${Number(value).toLocaleString('en-IN')}/month`
    : `${prefix}${Number(value).toLocaleString('en-IN')}`
}

function featureList(row: PropertyRow): string {
  const features = Array.isArray(row.features) ? row.features.filter(Boolean).slice(0, 5) : []
  return features.length ? features.join(', ') : 'Not listed'
}

function yesNo(value: any): string {
  return value ? 'Yes' : 'No'
}

export function selectPropertyRagProperties(properties: PropertyRow[] | null | undefined, criteria: SearchCriteria, limit = 5): PropertyRow[] {
  const live = excludeSampleProperties(properties || []).filter(p => p.status === 'active')
  if (!live.length) return []

  const hasIntent = !!criteria.intent
  const hasCriteria = hasIntent || (criteria.preferred_areas || []).length > 0 || !!criteria.budget_max

  if (!hasCriteria) {
    return live.slice(0, limit)
  }

  const result = searchPropertiesByFallbackChain(live, criteria)
  return (result.properties || live).slice(0, limit)
}

export function buildPropertyRagMarkdown(properties: PropertyRow[] | null | undefined, options: RagOptions = {}, focusProperties?: PropertyRow[] | null | undefined): string {
  const live = excludeSampleProperties(properties || [])
  const selectedSource = focusProperties && focusProperties.length ? focusProperties : live
  const selected = excludeSampleProperties(selectedSource || []).slice(0, options.limit || 5)
  const sales = live.filter(p => p.type === 'sale').length
  const rentals = live.filter(p => p.type === 'rental').length

  const lines: string[] = []
  lines.push(`# Property RAG Snapshot`)
  if (options.agentName || options.agencyName) {
    lines.push(`Agency: ${options.agencyName || options.agentName || 'Unknown'}`)
  }
  lines.push(`Inventory: ${live.length} active properties (${rentals} rentals, ${sales} sales)`)
  lines.push('')
  lines.push('Use only the facts below. If a detail is missing, ask the lead or defer to the agent instead of guessing.')

  for (let index = 0; index < selected.length; index++) {
    const row = selected[index]
    lines.push('')
    lines.push(`## ${index + 1}. ${row.title || 'Untitled property'}`)
    lines.push(`- ID: ${row.id}`)
    lines.push(`- Type: ${row.type}`)
    if (row.location) lines.push(`- Location: ${row.location}`)
    if (row.city) lines.push(`- City: ${row.city}`)
    if (row.bhk) lines.push(`- BHK: ${row.bhk}`)
    if (row.size_sqft) lines.push(`- Size: ${row.size_sqft} sq ft`)
    lines.push(`- Price: ${moneyLabel(row)}`)
    lines.push(`- Features: ${featureList(row)}`)
    if (row.possession_status) lines.push(`- Possession: ${row.possession_status}`)
    if ((row as any).floor_plan_available != null) lines.push(`- Floor plan available: ${yesNo((row as any).floor_plan_available)}`)
    if ((row as any).booking_started != null) lines.push(`- Booking started: ${yesNo((row as any).booking_started)}`)
    if ((row as any).finance_options) lines.push(`- Finance options: ${(row as any).finance_options}`)
    if ((row as any).extra_info) lines.push(`- Highlights: ${(row as any).extra_info}`)
    if ((row as any).area_ranking) lines.push(`- Area ranking: ${(row as any).area_ranking}`)
    if ((row as any).purchase_indicator != null) lines.push(`- Purchase indicator: ${(row as any).purchase_indicator}/5`)
    if ((row as any).parking_available != null) lines.push(`- Parking available: ${yesNo((row as any).parking_available)}`)
    if ((row as any).parking_details) lines.push(`- Parking details: ${(row as any).parking_details}`)
    if ((row as any).broker_recommendation) lines.push(`- Broker recommendation: ${(row as any).broker_recommendation}`)
    lines.push(`- Sample listing: no`)
  }

  return lines.join('\n')
}

export function buildPropertyRagSnapshot(properties: PropertyRow[] | null | undefined, options: RagOptions = {}, focusProperties?: PropertyRow[] | null | undefined): PropertyRagSnapshot {
  const live = excludeSampleProperties(properties || [])
  const selected = focusProperties && focusProperties.length
    ? excludeSampleProperties(focusProperties || []).slice(0, options.limit || 5)
    : selectPropertyRagProperties(properties, {
        intent: null,
        preferred_areas: [],
        budget_max: null,
      }, options.limit || 5)

  return {
    generated_at: new Date().toISOString(),
    agent_name: options.agentName,
    agency_name: options.agencyName,
    counts: {
      active: live.length,
      rentals: live.filter(p => p.type === 'rental').length,
      sales: live.filter(p => p.type === 'sale').length,
    },
    selected_property_ids: selected.map(p => p.id),
    markdown: buildPropertyRagMarkdown(properties, options, selected),
  }
}

export function buildPropertyRagContext(properties: PropertyRow[] | null | undefined, criteria: SearchCriteria, options: RagOptions = {}): string {
  const selected = selectPropertyRagProperties(properties, criteria, options.limit || 5)
  return buildPropertyRagMarkdown(properties, options, selected)
}
