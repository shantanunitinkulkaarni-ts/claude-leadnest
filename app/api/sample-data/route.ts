export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAgentAccess } from '@/lib/apiAuth'
import { purgeExpiredSampleData } from '@/lib/sampleCleanup'

// Seeds a Sample Lead + sample Properties for the onboarding simulation, so a
// brand-new agent can experience the bot before connecting WhatsApp. Sample
// rows are flagged is_sample=true and EXCLUDED from the free-plan caps.

async function upsertSampleProperty(agentId: string, row: Record<string, any>) {
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from('properties')
    .select('id')
    .eq('agent_id', agentId)
    .eq('is_sample', true)
    .eq('title', row.title)
    .maybeSingle()

  if (lookupError) throw lookupError

  if (existing?.id) {
    const { error } = await supabaseAdmin.from('properties').update(row).eq('id', existing.id)
    if (error) throw error
    return existing.id
  }

  const { data, error } = await supabaseAdmin.from('properties').insert(row).select('id').single()
  if (error) throw error
  return data?.id
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const agentId = body.agent_id
  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  const access = await requireAgentAccess(agentId)
  if ('error' in access) return access.error

  // Clean up any stale sample rows first, then refresh the live demo rows.
  await purgeExpiredSampleData(agentId).catch(() => null)

  const { data: agent } = await supabaseAdmin
    .from('agents').select('email, city').eq('id', agentId).single()
  const city = agent?.city || 'Pune'

  // Two realistic sample properties. Wakad/Baner so the guided demo message
  // ("a 2 BHK in Wakad") matches a real result.
  await Promise.all([
    upsertSampleProperty(agentId, {
      agent_id: agentId,
      is_sample: true,
      title: '2 BHK Apartment in Wakad (Sample)',
      location: 'Wakad',
      city,
      type: 'sale',
      category: 'residential',
      bhk: 2,
      price: 8500000,
      size_sqft: 950,
      status: 'active',
      possession_status: 'ready_to_move',
      floor_plan_available: true,
      booking_started: false,
      finance_options: 'Home loan available',
      area_ranking: 'premium',
      purchase_indicator: 5,
      parking_available: true,
      parking_details: 'Covered parking available',
      broker_recommendation: 'Strong buy. Premium area. Good for end use.',
      features: ['balcony', 'lift', 'security'],
      description: 'Sample property - bright 2 BHK near the Wakad bridge, ready to move in.',
    }),
    upsertSampleProperty(agentId, {
      agent_id: agentId,
      is_sample: true,
      title: '3 BHK Apartment in Baner (Sample)',
      location: 'Baner',
      city,
      type: 'sale',
      category: 'residential',
      bhk: 3,
      price: 14500000,
      size_sqft: 1450,
      status: 'active',
      possession_status: 'under_construction',
      possession_date: '2027-03-01',
      floor_plan_available: true,
      booking_started: true,
      finance_options: 'Home loan and builder tie-up available',
      area_ranking: 'premium',
      purchase_indicator: 4,
      parking_available: true,
      parking_details: 'Open and covered parking',
      broker_recommendation: 'Decent buy. Premium locality. Worth shortlisting.',
      features: ['balcony', 'lift', 'security'],
      description: 'Sample property - spacious 3 BHK in Baner with a balcony view.',
    }),
  ])

  // Sample lead. Email = the agent's own, so the demo's confirmation + alert
  // emails both land in the agent's inbox (they see that feature work too).
  const { data: existingLead } = await supabaseAdmin
    .from('leads')
    .select('*')
    .eq('agent_id', agentId)
    .eq('is_sample', true)
    .limit(1)

  if (existingLead && existingLead.length) {
    return NextResponse.json({ ok: true, seeded: false, lead: existingLead[0] })
  }

  const { data: lead } = await supabaseAdmin.from('leads').insert({
    agent_id: agentId,
    is_sample: true,
    name: 'Priya (Sample Lead)',
    phone: '+910000000001',
    email: agent?.email || null,
    source: 'sample',
    status: 'new',
    temperature: 'warm',
    opted_in: true,
  }).select().single()

  return NextResponse.json({ ok: true, seeded: true, lead })
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const agentId = body.agent_id
  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  const access = await requireAgentAccess(agentId)
  if ('error' in access) return access.error

  const cleaned = await purgeExpiredSampleData(agentId)
  return NextResponse.json({ ok: true, cleaned })
}
