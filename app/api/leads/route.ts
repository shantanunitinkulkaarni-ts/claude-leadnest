export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { pickFields, requireAgentAccess, requireLeadAccess } from '@/lib/apiAuth'

const CREATE_FIELDS = ['agent_id', 'name', 'phone', 'email', 'source', 'status', 'temperature', 'intent', 'preferred_areas', 'budget_min', 'budget_max', 'timeline', 'notes']
const UPDATE_FIELDS = ['name', 'phone', 'email', 'status', 'temperature', 'intent', 'preferred_areas', 'budget_min', 'budget_max', 'timeline', 'notes', 'bot_paused', 'post_visit_result']

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const agentId = searchParams.get('agent_id')
  const status = searchParams.get('status')
  const temperature = searchParams.get('temperature')

  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  const access = await requireAgentAccess(agentId)
  if ('error' in access) return access.error

  let query = supabaseAdmin
    .from('leads')
    .select('*')
    .eq('agent_id', agentId)
    .order('updated_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (temperature) query = query.eq('temperature', temperature)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const isArray = Array.isArray(body)
    const rows = isArray ? body : [body]

    if (rows.length === 0) return NextResponse.json({ error: 'No leads provided' }, { status: 400 })

    for (const row of rows) {
      if (!row.agent_id) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })
      const access = await requireAgentAccess(row.agent_id)
      if ('error' in access) return access.error
    }

    const safeRows = rows.map((row: any) => pickFields(row, CREATE_FIELDS))
    
    let query = supabaseAdmin
      .from('leads')
      .insert(isArray ? safeRows : safeRows[0])
      .select()
      
    if (!isArray) {
      query = query.single()
    }
    
    const { data, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json()
  const { id, ...updates } = body

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const access = await requireLeadAccess(id)
  if ('error' in access) return access.error

  const safeUpdates = pickFields(updates, UPDATE_FIELDS)
  if (Object.keys(safeUpdates).length === 0) return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('leads')
    .update(safeUpdates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
