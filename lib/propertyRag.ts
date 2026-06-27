import { searchPropertiesByFallbackChain, type PropertyRow, type SearchCriteria } from './propertySearch'
import { excludeSampleProperties } from './propertyVisibility'

type RagOptions = {
  agentName?: string
  agencyName?: string
  limit?: number
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
    lines.push(`- Sample listing: no`)
  }

  return lines.join('\n')
}

export function buildPropertyRagContext(properties: PropertyRow[] | null | undefined, criteria: SearchCriteria, options: RagOptions = {}): string {
  const selected = selectPropertyRagProperties(properties, criteria, options.limit || 5)
  return buildPropertyRagMarkdown(properties, options, selected)
}
