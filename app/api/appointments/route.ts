export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { pickFields, requireAgentAccess, requireAppointmentAccess, requireLeadAccess, requirePropertyAccess } from '@/lib/apiAuth'

const CREATE_FIELDS = ['agent_id', 'lead_id', 'property_id', 'scheduled_at', 'status']
const UPDATE_FIELDS = ['scheduled_at', 'status', 'post_visit_result', 'notes', 'reminder_sent', 'post_visit_prompted']

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get('agent_id')
  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  const access = await requireAgentAccess(agentId)
  if ('error' in access) return access.error

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .select('*, leads(name, phone), properties(title, location)')
    .eq('agent_id', agentId)
    .order('scheduled_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  if (!body.agent_id || !body.lead_id) {
    return NextResponse.json({ error: 'agent_id and lead_id required' }, { status: 400 })
  }

  const agentAccess = await requireAgentAccess(body.agent_id)
  if ('error' in agentAccess) return agentAccess.error

  const leadAccess = await requireLeadAccess(body.lead_id)
  if ('error' in leadAccess) return leadAccess.error
  if (leadAccess.agentId !== body.agent_id) return NextResponse.json({ error: 'Lead does not belong to agent' }, { status: 400 })

  if (body.property_id) {
    const propertyAccess = await requirePropertyAccess(body.property_id)
    if ('error' in propertyAccess) return propertyAccess.error
    if (propertyAccess.agentId !== body.agent_id) return NextResponse.json({ error: 'Property does not belong to agent' }, { status: 400 })
  }

  const safeBody = pickFields(body, CREATE_FIELDS)

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .insert(safeBody)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log activity
  await supabaseAdmin.from('activity_log').insert({
    agent_id: body.agent_id,
    lead_id: body.lead_id,
    type: 'visit_booked',
    title: 'Site visit booked',
    description: `Scheduled for ${new Date(body.scheduled_at).toLocaleString('en-IN')}`
  })

  // Update lead status
  await supabaseAdmin
    .from('leads')
    .update({ status: 'visit_booked' })
    .eq('id', body.lead_id)

  return NextResponse.json({ data })
}

export async function PATCH(request: NextRequest) {
  const body = await request.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const access = await requireAppointmentAccess(id)
  if ('error' in access) return access.error

  const safeUpdates = pickFields(updates, UPDATE_FIELDS)
  if (Object.keys(safeUpdates).length === 0) return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .update(safeUpdates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // When post-visit feedback is logged, push it onto the LEAD so the AI bot can
  // open its next message by referencing the visit and nurture toward a close.
  // This feedback context is Convorian's core conversion edge.
  const apptLeadId = (data as any)?.lead_id
  if (safeUpdates.post_visit_result && apptLeadId) {
    const { data: leadRow } = await supabaseAdmin
      .from('leads')
      .select('notes')
      .eq('id', apptLeadId)
      .maybeSingle()

    const feedbackNote = safeUpdates.notes
      ? `[Post-visit feedback — ${safeUpdates.post_visit_result}] ${safeUpdates.notes}`
      : `[Post-visit feedback — ${safeUpdates.post_visit_result}]`
    const mergedNotes = [leadRow?.notes, feedbackNote].filter(Boolean).join('\n')

    await supabaseAdmin
      .from('leads')
      .update({
        post_visit_result: safeUpdates.post_visit_result,
        notes: mergedNotes,
        bot_paused: false // ensure the bot can re-engage for the post-visit close
      })
      .eq('id', apptLeadId)
  }

  return NextResponse.json({ data })
}
