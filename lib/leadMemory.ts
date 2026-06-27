type ExistingAppointment = {
  scheduled_at?: string | null
  status?: string | null
} | null | undefined

export function buildLeadMemoryContext(lead: any, existingAppointment?: ExistingAppointment): string {
  return JSON.stringify({
    name: lead?.name || null,
    intent: lead?.intent || null,
    preferred_areas: Array.isArray(lead?.preferred_areas) ? lead.preferred_areas : [],
    budget_max: lead?.budget_max || null,
    bhk: lead?.bhk || null,
    visit_time: lead?.pending_appointment_time || null,
    email: lead?.email || null,
    status: lead?.status || null,
    temperature: lead?.temperature || null,
    matched_property_id: lead?.matched_property_id || null,
    post_visit_result: lead?.post_visit_result || null,
    conversation_summary: lead?.conversation_summary || null,
    bot_stage: lead?.bot_stage || 'greeting',
    existing_appointment: existingAppointment ? {
      scheduled_at: existingAppointment.scheduled_at || null,
      status: existingAppointment.status || null,
    } : null,
  }, null, 2)
}
