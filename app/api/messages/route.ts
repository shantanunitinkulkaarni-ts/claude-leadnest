import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const leadId = request.nextUrl.searchParams.get('lead_id')
  if (!leadId) return NextResponse.json({ error: 'lead_id required' }, { status: 400 })

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

  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('wa_phone_number_id, wa_access_token')
    .eq('id', body.agent_id)
    .single()

  if (!agent?.wa_phone_number_id) {
    return NextResponse.json({ error: 'WhatsApp not connected' }, { status: 400 })
  }

  const { sendWhatsAppMessage } = await import('@/lib/whatsapp')
  const waId = await sendWhatsAppMessage(
    agent.wa_phone_number_id,
    agent.wa_access_token,
    body.phone,
    body.content
  )

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
