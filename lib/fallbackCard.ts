// ─── Safe fallback "agent contact card" ──────────────────────────────────────
// When the bot can't safely answer (engine down, genuine knowledge gap, or a
// caught fabrication) it must NOT guess. Instead it replies with this standard
// card — the agent's real contact details — so the customer always has a clear,
// honest next step. This is the catch-all for any ambiguity (messaging plan #3).
//
// Pure + testable. Reads only the agent fields that exist; any missing field
// (e.g. office address or week-off, until the agent fills them in) is simply
// skipped so the card never shows blanks or "undefined".

export type AgentCardInfo = {
  name?: string | null
  agency_name?: string | null
  phone?: string | null
  city?: string | null
  state?: string | null
  office_open?: string | null   // "09:00"
  office_close?: string | null  // "19:00"
  office_address?: string | null // new field (optional until filled)
  weekly_off?: string | null     // new field e.g. "Sunday"
  holidays?: string | null       // new field, free text
}

// "09:00" -> "9 AM", "19:30" -> "7:30 PM". Returns '' if unparseable.
function prettyTime(t?: string | null): string {
  if (!t) return ''
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim())
  if (!m) return ''
  const h = Number(m[1]); const min = Number(m[2])
  if (Number.isNaN(h)) return ''
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${min ? ':' + String(min).padStart(2, '0') : ''} ${ampm}`
}

export function buildAgentContactCard(agent: AgentCardInfo): string {
  const lines: string[] = []
  lines.push('I want to make sure you get the exact answer. I have informed our team to connect with you as soon as possible, meanwhile you can connect with them too. Here are the details:')
  lines.push('') // blank line

  if (agent.agency_name && agent.agency_name.trim()) lines.push(`🏢 ${agent.agency_name.trim()}`)
  if (agent.name && agent.name.trim()) lines.push(`👤 ${agent.name.trim()}`)
  if (agent.phone && String(agent.phone).trim()) lines.push(`📞 ${String(agent.phone).trim()}`)

  const place = (agent.office_address && agent.office_address.trim())
    || [agent.city, agent.state].filter(Boolean).join(', ')
  if (place) lines.push(`📍 ${place}`)

  const open = prettyTime(agent.office_open)
  const close = prettyTime(agent.office_close)
  if (open && close) {
    let hours = `🕘 ${open}–${close}`
    if (agent.weekly_off && agent.weekly_off.trim()) hours += ` (closed ${agent.weekly_off.trim()})`
    lines.push(hours)
  }

  if (agent.holidays && agent.holidays.trim()) lines.push(`📅 ${agent.holidays.trim()}`)

  lines.push('') // blank line
  lines.push('Thanks for your patience! 🙏')

  return lines.join('\n')
}
