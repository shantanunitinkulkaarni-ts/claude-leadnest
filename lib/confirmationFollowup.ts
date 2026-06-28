const CONFIRMATION_FOLLOWUP_DELAY_MS = 90 * 60 * 1000

function formatIST(isoTime: string): string {
  try {
    return new Date(isoTime).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoTime
  }
}

export function shouldSendConfirmationFollowup(lead: any, nowMs = Date.now()): { send: boolean; reason: string } {
  if (!lead?.pending_appointment_time) return { send: false, reason: 'no_pending_appointment' }
  if (lead?.confirmation_followup_sent_at) return { send: false, reason: 'already_sent' }
  if (lead?.bot_paused) return { send: false, reason: 'bot_paused' }
  if (lead?.opted_in === false || lead?.nurture_state === 'opted_out') return { send: false, reason: 'opted_out' }

  const status = lead?.status
  if (status === 'visit_booked' || status === 'visit_done' || status === 'closed_won' || status === 'closed_lost') {
    return { send: false, reason: `status_${status}` }
  }

  const setAtMs = lead?.pending_appointment_set_at ? new Date(lead.pending_appointment_set_at).getTime() : 0
  if (!setAtMs || isNaN(setAtMs)) return { send: false, reason: 'no_pending_timestamp' }
  if (nowMs - setAtMs < CONFIRMATION_FOLLOWUP_DELAY_MS) return { send: false, reason: 'too_soon' }

  return { send: true, reason: 'followup_due' }
}

export function buildConfirmationFollowupMessage(lead: any, visitTime: string, propertyTitle?: string | null): string {
  const name = String(lead?.name || 'there').trim() || 'there'
  const when = formatIST(visitTime)
  const property = propertyTitle ? ` for ${propertyTitle}` : ''
  return `Just checking once, ${name} - should I keep the site visit${property} on ${when}? Reply Confirm and I'll lock it in.`
}
