export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAuthContext } from '@/lib/apiAuth'
import { buildPropertyRagMarkdown } from '@/lib/propertyRag'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const viaSecret = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  if (!viaSecret) {
    const auth = await getAuthContext()
    if ('error' in auth) return auth.error
    if (!auth.isSuperadmin) return NextResponse.json({ error: 'Superadmin only' }, { status: 403 })
  }

  const agentId = request.nextUrl.searchParams.get('agent_id')
  const format = request.nextUrl.searchParams.get('format')
  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  const { data: agent } = await supabaseAdmin.from('agents').select('id, agency_name, name').eq('id', agentId).maybeSingle()
  if (!agent) return NextResponse.json({ error: 'agent not found' }, { status: 404 })

  const { data: properties } = await supabaseAdmin
    .from('properties')
    .select('*')
    .eq('agent_id', agentId)
    .eq('status', 'active')

  const { data: snapshotRow } = await supabaseAdmin
    .from('activity_log')
    .select('metadata, created_at')
    .eq('agent_id', agentId)
    .eq('type', 'property_rag_snapshot')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const rag = typeof snapshotRow?.metadata?.markdown === 'string'
    ? snapshotRow.metadata.markdown
    : buildPropertyRagMarkdown((properties || []) as any[], {
        agentName: agent.name,
        agencyName: agent.agency_name,
        limit: 12,
      })

  if (format === 'md') {
    return new NextResponse(rag, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } })
  }

  return NextResponse.json({
    agent_id: agent.id,
    agency: agent.agency_name || agent.name || agent.id,
    generated_at: snapshotRow?.created_at || new Date().toISOString(),
    markdown: rag,
  })
}
