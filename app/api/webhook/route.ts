export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { generateBotReply } from '@/lib/gemini'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

const PROVIDER = process.env.WHATSAPP_PROVIDER || 'meta'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''
    let fromPhone = '', messageText = '', waMessageId = '', phoneNumberId = ''

    if (PROVIDER === 'twilio' || contentType.includes('application/x-www-form-urlencoded')) {
      const text = await request.text()
      const params = new URLSearchParams(text)
      fromPhone = (params.get('From') || '').replace('whatsapp:', '').trim()
      messageText = params.get('Body') || ''
      waMessageId = params.get('MessageSid') || ''
      phoneNumberId = 'twilio'
      if (!messageText || !fromPhone) return new NextResponse('OK', { status: 200 })
    } else {
      const body = await request.json()
      if (body.object !== 'whatsapp_business_account') return NextResponse.json({ status: 'ignored' })
      const value = body.entry?.[0]?.changes?.[0]?.value
      if (!value?.messages?.length) return NextResponse.json({ status: 'no_messages' })
      const incomingMsg = value.messages[0]
      phoneNumberId = value.metadata?.phone_number_id || ''
      fromPhone = incomingMsg.from || ''
      messageText = incomingMsg.text?.body || ''
      waMessageId = incomingMsg.id || ''
      if (!messageText || !phoneNumberId) return NextResponse.json({ status: 'no_text' })
    }

    let agent: any = null
    if (PROVIDER === 'twilio') {
      const testAgentId = process.env.TWILIO_TEST_AGENT_ID
      if (testAgentId) {
        const { data } = await supabaseAdmin.from('agents').select('*').eq('id', testAgentId).single()
        agent = data
      } else {
        const { data } = await supabaseAdmin.from('agents').select('*').eq('bot_active', true).limit(1).single()
        agent = data
      }
    } else {
      const { data } = await supabaseAdmin.from('agents').select('*').eq('wa_phone_number_id', phoneNumberId).eq('wa_verified', true).single()
      agent = data
    }

    if (!agent) {
      console.log('Webhook Debug: Agent not found')
      return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: 'agent_not_found' })
    }
    if (!agent.bot_active) {
      console.log('Webhook Debug: Bot is paused for agent')
      return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: 'bot_paused' })
    }
    if (agent.messages_used >= agent.messages_limit) {
      console.log('Webhook Debug: Message limit reached')
      return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: 'limit_reached' })
    }

    const now = new Date().toISOString()
    const windowExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    let { data: lead } = await supabaseAdmin.from('leads').select('*').eq('agent_id', agent.id).eq('phone', fromPhone).maybeSingle()

    if (!lead) {
      const { data: newLead } = await supabaseAdmin.from('leads').insert({
        agent_id: agent.id, phone: fromPhone, last_message_at: now,
        window_expires_at: windowExpiry, status: 'new', temperature: 'new'
      }).select().single()
      lead = newLead
      await supabaseAdmin.from('activity_log').insert({
        agent_id: agent.id, lead_id: lead.id, type: 'lead_created',
        title: 'New lead created', description: `First message from ${fromPhone}`
      })
    } else {
      await supabaseAdmin.from('leads').update({ last_message_at: now, window_expires_at: windowExpiry }).eq('id', lead.id)
    }

    await supabaseAdmin.from('messages').insert({
      lead_id: lead.id, agent_id: agent.id, direction: 'inbound',
      content: messageText, wa_message_id: waMessageId, sent_by: 'lead'
    })

    if (lead.bot_paused) {
      console.log('Webhook Debug: Lead is in manual mode (bot paused)')
      return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: 'manual_mode' })
    }

    console.log(`Webhook Debug: Calling Gemini for lead ${lead.phone} with message: "${messageText}"`)
    const { reply, metadata } = await generateBotReply(agent.id, lead.id, messageText)
    console.log(`Webhook Debug: Gemini replied with: "${reply}" and metadata:`, metadata)

    const leadUpdates: any = { updated_at: now }
    if (metadata.score) leadUpdates.ai_score = metadata.score
    if (metadata.temperature) leadUpdates.temperature = metadata.temperature
    if (metadata.intent) leadUpdates.intent = metadata.intent
    if (metadata.areas) leadUpdates.preferred_areas = metadata.areas
    if (metadata.budget_min) leadUpdates.budget_min = metadata.budget_min
    if (metadata.budget_max) leadUpdates.budget_max = metadata.budget_max
    if (metadata.timeline) leadUpdates.timeline = metadata.timeline
    if (metadata.name) leadUpdates.name = metadata.name
    if (metadata.score >= 7) leadUpdates.status = 'qualified'
    else if (metadata.score >= 4) leadUpdates.status = 'contacted'

    await supabaseAdmin.from('leads').update(leadUpdates).eq('id', lead.id)

    if (metadata.score) {
      await supabaseAdmin.from('activity_log').insert({
        agent_id: agent.id, lead_id: lead.id, type: 'score_updated',
        title: `Lead scored ${metadata.score}/10 — ${metadata.temperature || 'unknown'}`,
        description: `Intent: ${metadata.intent || '?'} | Budget: ${metadata.budget_min ? `₹${metadata.budget_min/100000}L` : '?'}`
      })
    }

    const toPhone = PROVIDER === 'twilio' ? `whatsapp:${fromPhone}` : fromPhone
    console.log(`Webhook Debug: Sending WhatsApp message via Twilio to ${toPhone}`)
    const outWaId = await sendWhatsAppMessage(agent.wa_phone_number_id, agent.wa_access_token, toPhone, reply)
    console.log(`Webhook Debug: WhatsApp message sent. Twilio SID/ID: ${outWaId}`)

    await supabaseAdmin.from('messages').insert({
      lead_id: lead.id, agent_id: agent.id, direction: 'outbound',
      content: reply, wa_message_id: outWaId || undefined, sent_by: 'bot'
    })

    await supabaseAdmin.from('agents').update({ messages_used: (agent.messages_used || 0) + 2 }).eq('id', agent.id)

    return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: 'ok' })

  } catch (err: any) {
    console.error('Webhook error:', err)
    return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: 'error', message: err.message }, { status: 500 })
  }
}
