export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAgentAccess, requireLeadAccess } from '@/lib/apiAuth'

export async function GET(request: NextRequest) {
  const leadId = request.nextUrl.searchParams.get('lead_id')
  if (!leadId) return NextResponse.json({ error: 'lead_id required' }, { status: 400 })

  const access = await requireLeadAccess(leadId)
  if ('error' in access) return access.error

  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  // Manual message from agent
  const body = await request.json()
  if (!body.agent_id || !body.lead_id || !body.content) {
    return NextResponse.json({ error: 'agent_id, lead_id and content required' }, { status: 400 })
  }

  const agentAccess = await requireAgentAccess(body.agent_id)
  if ('error' in agentAccess) return agentAccess.error

  const leadAccess = await requireLeadAccess(body.lead_id)
  if ('error' in leadAccess) return leadAccess.error
  if (leadAccess.agentId !== body.agent_id) return NextResponse.json({ error: 'Lead does not belong to agent' }, { status: 400 })

  // SECURITY: the recipient is the VERIFIED lead's own number, never a
  // client-supplied phone. Otherwise an agent could send from their business
  // number to an arbitrary phone while logging it under someone else's lead
  // (consent / billing / audit problem, and a Meta-ban risk).
  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('phone, opted_in')
    .eq('id', body.lead_id)
    .single()
  if (!lead?.phone) return NextResponse.json({ error: 'This lead has no phone number on file' }, { status: 400 })
  if (lead.opted_in === false) return NextResponse.json({ error: 'This lead opted out — messaging is not allowed' }, { status: 400 })
  const toPhone = lead.phone

  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('wa_phone_number_id, wa_access_token')
    .eq('id', body.agent_id)
    .single()

  if (!agent?.wa_phone_number_id) {
    return NextResponse.json({ error: 'WhatsApp not connected' }, { status: 400 })
  }

  // Send via Meta Cloud API direct (the only channel).
  let waId: string | null = null
  let sendError: string | null = null
  {
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp')
    waId = await sendWhatsAppMessage(
      agent.wa_phone_number_id,
      agent.wa_access_token,
      toPhone,
      body.content
    )
    if (!waId) sendError = 'meta_send_returned_null'
  }

  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({
      lead_id: body.lead_id,
      agent_id: body.agent_id,
      direction: 'outbound',
      content: body.content,
      wa_message_id: waId,
      sent_by: 'agent',
      // Record a rejected send (reason kept for superadmins). Item #1.
      ...(waId ? {} : {
        status: 'failed', delivery_status: 'failed',
        delivery_error: (sendError || 'send_failed').slice(0, 500),
        delivery_updated_at: new Date().toISOString(),
      }),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
