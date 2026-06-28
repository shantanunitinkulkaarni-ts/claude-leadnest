export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { pickFields, requireAgentAccess, requireLeadAccess } from '@/lib/apiAuth'
import { isPendingAppointmentExpired } from '@/lib/appointmentConfirmation'
import { isFreePlan, FREE_LEAD_CAP } from '@/lib/planLimits'
import { purgeExpiredSampleData } from '@/lib/sampleCleanup'

// How recent an 'engine_fallback' activity_log row has to be to still count
// as "the last reply was a fallback" for the inbox health badge. Past this
// window we assume a later (unlogged) good reply has superseded it.
const FALLBACK_HEALTH_WINDOW_MS = 15 * 60 * 1000

const CREATE_FIELDS = ['agent_id', 'name', 'phone', 'email', 'source', 'status', 'temperature', 'intent', 'preferred_areas', 'budget_min', 'budget_max', 'timeline', 'notes', 'opted_in', 'opt_in_at', 'opt_in_source', 'consent_confirmed', 'consent_confirmed_at']
const UPDATE_FIELDS = ['name', 'phone', 'email', 'status', 'temperature', 'intent', 'preferred_areas', 'budget_min', 'budget_max', 'timeline', 'notes', 'bot_paused', 'post_visit_result']

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const agentId = searchParams.get('agent_id')
  const status = searchParams.get('status')
  const temperature = searchParams.get('temperature')

  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  const access = await requireAgentAccess(agentId)
  if ('error' in access) return access.error

  await purgeExpiredSampleData(agentId).catch(() => null)

  let query = supabaseAdmin
    .from('leads')
    .select('*')
    .eq('agent_id', agentId)
    .order('updated_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (temperature) query = query.eq('temperature', temperature)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const leadIds = (data || []).map((l: any) => l.id)
  let fallbackLeadIds = new Set<string>()
  if (leadIds.length > 0) {
    const since = new Date(Date.now() - FALLBACK_HEALTH_WINDOW_MS).toISOString()
    const { data: fallbacks } = await supabaseAdmin
      .from('activity_log')
      .select('lead_id')
      .eq('agent_id', agentId)
      .eq('type', 'engine_fallback')
      .gte('created_at', since)
      .in('lead_id', leadIds)
    fallbackLeadIds = new Set((fallbacks || []).map((f: any) => f.lead_id))
  }

  const withHealth = (data || []).map((lead: any) => ({
    ...lead,
    health: fallbackLeadIds.has(lead.id)
      ? 'fallback'
      : lead.pending_appointment_time && !isPendingAppointmentExpired(lead.pending_appointment_set_at)
        ? 'pending_confirmation'
        : 'ok',
  }))

  return NextResponse.json({ data: withHealth })
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

    // Free-plan cap: total leads limited (nudge upgrade). Legacy/paid uncapped.
    const firstAgentId = rows[0].agent_id
    const { data: planRow } = await supabaseAdmin.from('agents').select('plan').eq('id', firstAgentId).single()
    if (isFreePlan(planRow)) {
      const { count } = await supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).eq('agent_id', firstAgentId).eq('is_sample', false)
      if ((count || 0) + rows.length > FREE_LEAD_CAP) {
        return NextResponse.json({ error: `The free plan is limited to ${FREE_LEAD_CAP} leads. Upgrade to add more.`, code: 'free_limit' }, { status: 403 })
      }
    }

    const safeRows = rows.map((row: any) => pickFields(row, CREATE_FIELDS))

    // For single-row creates from the dashboard, check for duplicate phone under
    // the same agent before inserting — return 409 with the existing lead so the
    // UI can surface it to the agent instead of silently creating a duplicate.
    if (!isArray && safeRows[0].phone && safeRows[0].agent_id) {
      const { data: existing } = await supabaseAdmin
        .from('leads')
        .select('id,name,phone,status,temperature,created_at')
        .eq('agent_id', safeRows[0].agent_id)
        .eq('phone', safeRows[0].phone)
        .maybeSingle()
      if (existing) {
        return NextResponse.json(
          { error: 'A lead with this phone number already exists', existing_lead: existing },
          { status: 409 }
        )
      }
    }

    let query: any = supabaseAdmin
      .from('leads')
      .insert(isArray ? safeRows : safeRows[0])
      .select()

    if (!isArray) {
      query = query.single()
    }

    const { data, error } = await query

    if (error) {
      if (error.code === '23505') {
        // Unique constraint hit (race or bulk insert with dupe) — return 409
        return NextResponse.json({ error: 'Duplicate lead: a lead with this phone already exists for this agent' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
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
