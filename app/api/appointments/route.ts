import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get('agent_id')
  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

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

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .insert(body)
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

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
