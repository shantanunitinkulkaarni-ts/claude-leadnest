import { supabaseAdmin } from './supabase'
import { buildAgentBookingRagSnapshot, type BookingRagSnapshot } from './bookingRag'

type AgentRow = {
  id: string
  name?: string | null
  agency_name?: string | null
  office_open?: string | null
  office_close?: string | null
  weekly_off?: string | null
  holidays?: string | null
}

export async function refreshAgentBookingRagSnapshot(agentId: string, limit = 10): Promise<BookingRagSnapshot | null> {
  const [{ data: agent }, { data: properties }] = await Promise.all([
    supabaseAdmin
      .from('agents')
      .select('id, name, agency_name, office_open, office_close, weekly_off, holidays')
      .eq('id', agentId)
      .maybeSingle(),
    supabaseAdmin
      .from('properties')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false }),
  ])

  if (!agent) return null

  const snapshot = buildAgentBookingRagSnapshot(agent as AgentRow, properties as any[] || [], {
    agentName: (agent as AgentRow).name || undefined,
    agencyName: (agent as AgentRow).agency_name || undefined,
    limit,
  })

  await supabaseAdmin.from('activity_log').insert({
    agent_id: agentId,
    type: 'booking_rag_snapshot',
    title: 'Booking RAG refreshed',
    description: `Updated booking knowledge pack for ${snapshot.counts.active} active and ${snapshot.counts.unavailable} unavailable properties`,
    metadata: snapshot,
  })

  return snapshot
}
