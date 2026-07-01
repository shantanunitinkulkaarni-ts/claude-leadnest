type ExistingAppointment = {
  scheduled_at?: string | null
  status?: string | null
} | null | undefined

type RecentChatEntry = {
  role?: 'user' | 'bot'
  text?: string | null
  ts?: string | null
} | null | undefined

function missingLeadFields(lead: any, existingAppointment?: ExistingAppointment): string[] {
  const missing: string[] = []
  if (!lead?.language) missing.push('language')
  if (!lead?.name) missing.push('name')
  if (!lead?.intent) missing.push('intent')
  if (!Array.isArray(lead?.preferred_areas) || !lead.preferred_areas.length) missing.push('preferred_areas')
  if (!lead?.budget_max) missing.push('budget_max')
  if (!lead?.bhk) missing.push('bhk')
  if (!lead?.email) missing.push('email')
  if (!lead?.pending_appointment_time && !existingAppointment?.scheduled_at) missing.push('visit_time')
  return missing
}

export function buildLeadMemoryContext(lead: any, existingAppointment?: ExistingAppointment, recentHistory: RecentChatEntry[] = []): string {
  const recent = (recentHistory || []).filter(Boolean) as NonNullable<RecentChatEntry>[]
  const lastUserMessage = [...recent].reverse().find(entry => entry?.role === 'user' && entry?.text)?.text || null
  const lastBotMessage = [...recent].reverse().find(entry => entry?.role === 'bot' && entry?.text)?.text || null

  return JSON.stringify({
    current_stage: lead?.bot_stage || 'greeting',
    lead_status: lead?.status || null,
    known: {
      language: lead?.language || null,
      name: lead?.name || null,
      intent: lead?.intent || null,
      preferred_areas: Array.isArray(lead?.preferred_areas) ? lead.preferred_areas : [],
      budget_max: lead?.budget_max || null,
      bhk: lead?.bhk || null,
      visit_time: lead?.pending_appointment_time || null,
      email: lead?.email || null,
      matched_property_id: lead?.matched_property_id || null,
      post_visit_result: lead?.post_visit_result || null,
      temperature: lead?.temperature || null,
      bot_paused: !!lead?.bot_paused,
      nurture_state: lead?.nurture_state || null,
    },
    missing: missingLeadFields(lead, existingAppointment),
    conversation: {
      summary: lead?.conversation_summary || null,
      last_user_message: lastUserMessage,
      last_bot_message: lastBotMessage,
    },
    existing_appointment: existingAppointment ? {
      scheduled_at: existingAppointment.scheduled_at || null,
      status: existingAppointment.status || null,
    } : null,
  }, null, 2)
}
