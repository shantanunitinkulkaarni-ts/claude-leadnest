import { supabaseAdmin } from './supabase'

const SAMPLE_TTL_MS = 5 * 60 * 1000

function sampleCutoffIso(nowMs = Date.now()): string {
  return new Date(nowMs - SAMPLE_TTL_MS).toISOString()
}

async function purgeSampleLeadRows(agentId?: string): Promise<number> {
  let query = supabaseAdmin
    .from('leads')
    .select('id')
    .eq('is_sample', true)
    .lt('created_at', sampleCutoffIso())

  if (agentId) query = query.eq('agent_id', agentId)

  const { data: sampleLeads, error } = await query
  if (error) throw error

  const ids = (sampleLeads || []).map((row: any) => row.id)
  if (!ids.length) return 0

  await supabaseAdmin.from('messages').delete().in('lead_id', ids)
  await supabaseAdmin.from('appointments').delete().in('lead_id', ids)
  const { error: deleteError } = await supabaseAdmin.from('leads').delete().in('id', ids)
  if (deleteError) throw deleteError

  return ids.length
}

async function purgeSamplePropertyRows(agentId?: string): Promise<number> {
  let query = supabaseAdmin
    .from('properties')
    .select('id')
    .eq('is_sample', true)
    .lt('created_at', sampleCutoffIso())

  if (agentId) query = query.eq('agent_id', agentId)

  const { data: sampleProperties, error } = await query
  if (error) throw error

  const ids = (sampleProperties || []).map((row: any) => row.id)
  if (!ids.length) return 0

  const { error: deleteError } = await supabaseAdmin.from('properties').delete().in('id', ids)
  if (deleteError) throw deleteError

  return ids.length
}

export async function purgeExpiredSampleData(agentId?: string): Promise<{ leads: number; properties: number }> {
  const [leads, properties] = await Promise.all([
    purgeSampleLeadRows(agentId),
    purgeSamplePropertyRows(agentId),
  ])

  return { leads, properties }
}

