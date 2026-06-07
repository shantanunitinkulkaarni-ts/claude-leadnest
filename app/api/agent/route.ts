import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { pickFields, requireAgentAccess } from '@/lib/apiAuth'

const USER_ALLOWED_FIELDS = ['name', 'agency_name', 'city', 'state', 'areas', 'bot_tone', 'office_open', 'office_close', 'languages', 'bot_active', 'wa_balance', 'out_of_office_message']
const SUPERADMIN_ALLOWED_FIELDS = [...USER_ALLOWED_FIELDS, 'wa_balance', 'plan', 'plan_status', 'messages_limit']

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const agentId = searchParams.get('id')
  if (!agentId) return NextResponse.json({ error: 'agent id required' }, { status: 400 })

  try {
    const access = await requireAgentAccess(agentId)
    if ('error' in access) return access.error

    const { data, error } = await supabaseAdmin.from('agents').select('*').eq('id', agentId).single()
    if (error) throw error
    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const agentId = searchParams.get('id')
  if (!agentId) return NextResponse.json({ error: 'agent id required' }, { status: 400 })

  try {
    const access = await requireAgentAccess(agentId)
    if ('error' in access) return access.error

    const body = await request.json()
    const allowedFields = access.isSuperadmin ? SUPERADMIN_ALLOWED_FIELDS : USER_ALLOWED_FIELDS
    const safeBody = pickFields(body, allowedFields)
    if (Object.keys(safeBody).length === 0) return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('agents')
      .update(safeBody)
      .eq('id', agentId)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
