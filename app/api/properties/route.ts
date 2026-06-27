export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { pickFields, requireAgentAccess, requirePropertyAccess } from '@/lib/apiAuth'
import { isFreePlan, FREE_PROPERTY_CAP } from '@/lib/planLimits'
import { refreshPropertyRagSnapshot } from '@/lib/propertyRagRefresh'

const EXTRA = ['possession_date', 'possession_status', 'deposit', 'project_website', 'website_ai_consent', 'extra_info']
const CREATE_FIELDS = ['agent_id', 'title', 'location', 'city', 'price', 'rent_per_month', 'type', 'category', 'bhk', 'size_sqft', 'description', 'features', 'property_media', 'status', ...EXTRA]
const UPDATE_FIELDS = ['title', 'location', 'city', 'price', 'rent_per_month', 'type', 'category', 'bhk', 'size_sqft', 'description', 'features', 'property_media', 'status', ...EXTRA]

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get('agent_id')
  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  const access = await requireAgentAccess(agentId)
  if ('error' in access) return access.error

  const { data, error } = await supabaseAdmin
    .from('properties')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  if (!body.agent_id) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  const access = await requireAgentAccess(body.agent_id)
  if ('error' in access) return access.error

  // Free-plan cap: total properties limited (nudge upgrade). Legacy/paid uncapped.
  const { data: planRow } = await supabaseAdmin.from('agents').select('plan').eq('id', body.agent_id).single()
  if (isFreePlan(planRow)) {
    const { count } = await supabaseAdmin.from('properties').select('id', { count: 'exact', head: true }).eq('agent_id', body.agent_id).eq('is_sample', false)
    if ((count || 0) >= FREE_PROPERTY_CAP) {
      return NextResponse.json({ error: `The free plan is limited to ${FREE_PROPERTY_CAP} properties. Upgrade to add more.`, code: 'free_limit' }, { status: 403 })
    }
  }

  const safeBody = pickFields(body, CREATE_FIELDS)

  const { data, error } = await supabaseAdmin
    .from('properties')
    .insert(safeBody)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Keep the property RAG snapshot fresh whenever inventory changes.
  await refreshPropertyRagSnapshot(body.agent_id).catch(() => null)

  return NextResponse.json({ data })
}

export async function PATCH(request: NextRequest) {
  const body = await request.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const access = await requirePropertyAccess(id)
  if ('error' in access) return access.error

  const safeUpdates = pickFields(updates, UPDATE_FIELDS)
  if (Object.keys(safeUpdates).length === 0) return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('properties')
    .update(safeUpdates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await refreshPropertyRagSnapshot(access.agentId).catch(() => null)
  return NextResponse.json({ data })
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const access = await requirePropertyAccess(id)
  if ('error' in access) return access.error

  const { error } = await supabaseAdmin.from('properties').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await refreshPropertyRagSnapshot(access.agentId).catch(() => null)

  return NextResponse.json({ ok: true })
}
