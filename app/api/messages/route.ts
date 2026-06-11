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

  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('wa_phone_number_id, wa_access_token, msg91_integrated_number')
    .eq('id', body.agent_id)
    .single()

  if (!agent?.wa_phone_number_id && !agent?.msg91_integrated_number) {
    return NextResponse.json({ error: 'WhatsApp not connected' }, { status: 400 })
  }

  // Agents connected via MSG91 send through it; others via Meta/Twilio.
  let waId: string | null
  if (agent.msg91_integrated_number) {
    const { sendViaMsg91 } = await import('@/lib/whatsapp')
    waId = await sendViaMsg91(agent.msg91_integrated_number, body.phone, body.content)
  } else {
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp')
    waId = await sendWhatsAppMessage(
      agent.wa_phone_number_id,
      agent.wa_access_token,
      body.phone,
      body.content
    )
  }

  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({
      lead_id: body.lead_id,
      agent_id: body.agent_id,
      direction: 'outbound',
      content: body.content,
      wa_message_id: waId,
      sent_by: 'agent'
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
