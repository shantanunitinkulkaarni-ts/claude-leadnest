import { supabaseAdmin } from './supabase'
import { buildPropertyRagSnapshot, type PropertyRagSnapshot } from './propertyRag'

type AgentRow = {
  id: string
  name?: string | null
  agency_name?: string | null
}

export async function refreshPropertyRagSnapshot(agentId: string, limit = 12): Promise<PropertyRagSnapshot | null> {
  const [{ data: agent }, { data: properties }] = await Promise.all([
    supabaseAdmin.from('agents').select('id, name, agency_name').eq('id', agentId).maybeSingle(),
    supabaseAdmin.from('properties').select('*').eq('agent_id', agentId).eq('status', 'active'),
  ])

  if (!agent) return null

  const snapshot = buildPropertyRagSnapshot(properties as any[] || [], {
    agentName: (agent as AgentRow).name || undefined,
    agencyName: (agent as AgentRow).agency_name || undefined,
    limit,
  })

  await supabaseAdmin.from('activity_log').insert({
    agent_id: agentId,
    type: 'property_rag_snapshot',
    title: 'Property RAG refreshed',
    description: `Updated inventory snapshot for ${snapshot.counts.active} active properties`,
    metadata: snapshot,
  })

  return snapshot
}
