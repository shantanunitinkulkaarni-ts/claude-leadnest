import { excludeSampleProperties } from './propertyVisibility'

export type BookingRagSnapshot = {
  generated_at: string
  agent_id?: string
  agent_name?: string
  agency_name?: string
  timezone: 'Asia/Kolkata'
  policy: {
    office_open: string
    office_close: string
    weekly_off: string | null
    holidays: string | null
  }
  counts: {
    total: number
    active: number
    unavailable: number
  }
  selected_property_ids: string[]
  markdown: string
}

type BookingRagOptions = {
  agentName?: string
  agencyName?: string
  selectedPropertyId?: string | null
  limit?: number
}

function cleanText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function moneyLabel(row: any): string {
  if (row?.type === 'rental') {
    const rent = row?.rent_per_month
    return rent ? `₹${Number(rent).toLocaleString('en-IN')}/month` : 'Price on request'
  }
  const price = row?.price
  return price ? `₹${Number(price).toLocaleString('en-IN')}` : 'Price on request'
}

function propertyStatusLabel(status: unknown): string {
  const text = cleanText(status, 'active').replace(/_/g, ' ')
  return text || 'active'
}

function isActiveProperty(row: any): boolean {
  return propertyStatusLabel(row?.status).toLowerCase() === 'active'
}

function summarizeProperty(row: any): string {
  const parts: string[] = []
  parts.push(`- ID: ${row.id}`)
  parts.push(`- Title: ${cleanText(row.title, 'Untitled property')}`)
  if (row.location) parts.push(`- Location: ${cleanText(row.location)}`)
  if (row.type) parts.push(`- Type: ${cleanText(row.type)}`)
  parts.push(`- Status: ${propertyStatusLabel(row.status)}`)
  if (row.bhk) parts.push(`- BHK: ${row.bhk}`)
  if (row.size_sqft) parts.push(`- Size: ${Number(row.size_sqft).toLocaleString('en-IN')} sq ft`)
  parts.push(`- Price: ${moneyLabel(row)}`)
  return parts.join('\n')
}

function summarizeAgentPolicy(agent: any): string[] {
  const lines: string[] = []
  lines.push(`- Timezone: Asia/Kolkata (IST)`)
  lines.push(`- Office hours: ${cleanText(agent?.office_open, '09:00')} to ${cleanText(agent?.office_close, '19:00')}`)
  if (cleanText(agent?.weekly_off)) lines.push(`- Weekly off: ${cleanText(agent.weekly_off)}`)
  if (cleanText(agent?.holidays)) lines.push(`- Holiday policy: ${cleanText(agent.holidays)}`)
  lines.push(`- Booking rule: never book outside office hours, on the weekly off, or for properties that are not active.`)
  return lines
}

export function buildAgentBookingRagMarkdown(
  agent: any,
  properties: any[] | null | undefined,
  options: BookingRagOptions = {},
): string {
  const all = excludeSampleProperties(properties || [])
  const active = all.filter(isActiveProperty)
  const unavailable = all.filter(row => !isActiveProperty(row))
  const selectedId = options.selectedPropertyId || null
  const selected = selectedId
    ? all.find(row => row.id === selectedId)
    : active[0] || unavailable[0] || null

  const selectedActive = selected ? isActiveProperty(selected) : false
  const activeList = active.slice(0, options.limit || 5)
  const unavailableList = unavailable.slice(0, options.limit || 5)

  const lines: string[] = []
  lines.push(`# Booking Knowledge Pack`)
  lines.push(`Agent: ${options.agentName || cleanText(agent?.name, 'Unknown agent')}`)
  if (options.agencyName || cleanText(agent?.agency_name)) {
    lines.push(`Agency: ${options.agencyName || cleanText(agent?.agency_name)}`)
  }
  lines.push('')
  lines.push('## Rules')
  lines.push(...summarizeAgentPolicy(agent))

  lines.push('')
  lines.push('## Selected property')
  if (selected) {
    lines.push(summarizeProperty(selected))
    lines.push(`- Selected property is ${selectedActive ? 'bookable' : 'not bookable'} right now`)
  } else {
    lines.push('- None selected yet')
  }

  lines.push('')
  lines.push(`## Active properties (${active.length})`)
  if (activeList.length) {
    for (const row of activeList) {
      lines.push('')
      lines.push(summarizeProperty(row))
    }
  } else {
    lines.push('- No active properties found')
  }

  lines.push('')
  lines.push(`## Unavailable properties (${unavailable.length})`)
  if (unavailableList.length) {
    for (const row of unavailableList) {
      lines.push('')
      lines.push(summarizeProperty(row))
    }
  } else {
    lines.push('- No unavailable properties found')
  }

  lines.push('')
  lines.push('## Booking instructions for the decoder')
  lines.push('- Convert the customer request into one IST appointment.')
  lines.push('- If the slot is outside hours, on the weekly off, or on a blocked holiday, mark it as not bookable.')
  lines.push('- If the selected property is sold, rented, on hold, or otherwise not active, mark it as not bookable.')
  lines.push('- When not bookable, do not invent a substitute slot. Return the request for human follow-up.')

  return lines.join('\n')
}

export function buildAgentBookingRagSnapshot(
  agent: any,
  properties: any[] | null | undefined,
  options: BookingRagOptions = {},
): BookingRagSnapshot {
  const all = excludeSampleProperties(properties || [])
  const active = all.filter(isActiveProperty)
  const unavailable = all.filter(row => !isActiveProperty(row))
  const selectedId = options.selectedPropertyId || null
  const selected = selectedId
    ? all.find(row => row.id === selectedId)
    : active[0] || unavailable[0] || null

  return {
    generated_at: new Date().toISOString(),
    agent_id: agent?.id,
    agent_name: options.agentName || cleanText(agent?.name) || undefined,
    agency_name: options.agencyName || cleanText(agent?.agency_name) || undefined,
    timezone: 'Asia/Kolkata',
    policy: {
      office_open: cleanText(agent?.office_open, '09:00'),
      office_close: cleanText(agent?.office_close, '19:00'),
      weekly_off: cleanText(agent?.weekly_off) || null,
      holidays: cleanText(agent?.holidays) || null,
    },
    counts: {
      total: all.length,
      active: active.length,
      unavailable: unavailable.length,
    },
    selected_property_ids: selected ? [selected.id] : [],
    markdown: buildAgentBookingRagMarkdown(agent, properties, options),
  }
}
