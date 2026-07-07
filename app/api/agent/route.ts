export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { pickFields, requireAgentAccess } from '@/lib/apiAuth'
import { verifyAgentPin } from '@/lib/agentPin'
import { refreshAgentBookingRagSnapshot } from '@/lib/bookingRagRefresh'
import {
  SUPERADMIN_EDITABLE_FIELDS,
  USER_EDITABLE_FIELDS,
  isPausingBot,
  pickAgentResponseFields,
} from '@/lib/agentRoutePolicy'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const agentId = searchParams.get('id')
  if (!agentId) return NextResponse.json({ error: 'agent id required' }, { status: 400 })

  try {
    const access = await requireAgentAccess(agentId)
    if ('error' in access) return access.error

    const { data, error } = await supabaseAdmin.from('agents').select('*').eq('id', agentId).single()
    if (error) throw error
    return NextResponse.json({ data: pickAgentResponseFields(data as Record<string, any>, access.isSuperadmin) })
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
    const allowedFields = access.isSuperadmin ? SUPERADMIN_EDITABLE_FIELDS : USER_EDITABLE_FIELDS
    const safeBody = pickFields(body, Array.from(allowedFields))
    if (Object.keys(safeBody).length === 0) return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 })

    let mustSetPin = false
    if (!access.isSuperadmin && isPausingBot(safeBody)) {
      const pin = typeof body.pin === 'string' ? body.pin : ''
      if (!pin) return NextResponse.json({ error: 'PIN required to change bot status' }, { status: 403 })
      const pinCheck = await verifyAgentPin(agentId, pin)
      if (!pinCheck.ok) return NextResponse.json({ error: 'Incorrect PIN' }, { status: 403 })
      mustSetPin = !!pinCheck.mustSetPin
    }

    const { data, error } = await supabaseAdmin
      .from('agents')
      .update(safeBody)
      .eq('id', agentId)
      .select()
      .single()

    if (error) throw error
    await refreshAgentBookingRagSnapshot(agentId).catch(() => null)
    return NextResponse.json({
      data: pickAgentResponseFields(data as Record<string, any>, access.isSuperadmin),
      ...(mustSetPin ? { mustSetPin: true } : {}),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
