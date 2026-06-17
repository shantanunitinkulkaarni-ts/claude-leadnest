export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { pickFields, requireAgentAccess } from '@/lib/apiAuth'

const CREATE_FIELDS = ['agent_id', 'lead_id', 'type', 'title', 'description']

export async function GET(request: NextRequest) {
  const leadId = request.nextUrl.searchParams.get('lead_id')
  const agentId = request.nextUrl.searchParams.get('agent_id')

  if (!leadId && !agentId) return NextResponse.json({ error: 'lead_id or agent_id required' }, { status: 400 })

  if (agentId) {
    const access = await requireAgentAccess(agentId)
    if ('error' in access) return access.error
    const { data, error } = await supabaseAdmin
      .from('activity_log')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  // leadId path — find agent_id first
  const { data: lead } = await supabaseAdmin.from('leads').select('agent_id').eq('id', leadId!).maybeSingle()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const access = await requireAgentAccess(lead.agent_id)
  if ('error' in access) return access.error

  const { data, error } = await supabaseAdmin
    .from('activity_log')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.agent_id) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

    const access = await requireAgentAccess(body.agent_id)
    if ('error' in access) return access.error

    const safeBody = pickFields(body, CREATE_FIELDS)
    const { data, error } = await supabaseAdmin
      .from('activity_log')
      .insert(safeBody)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
