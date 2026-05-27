export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { generateBotReply } from '@/lib/gemini'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

// GET — webhook verification by Meta
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('Webhook verified')
    return new NextResponse(challenge, { status: 200 })
  }

  return new NextResponse('Forbidden', { status: 403 })
}

// POST — incoming messages from leads
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Meta sends test pings
    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ status: 'ignored' })
    }

    const entry = body.entry?.[0]
    const changes = entry?.changes?.[0]
    const value = changes?.value

    if (!value?.messages?.length) {
      return NextResponse.json({ status: 'no_messages' })
    }

    const incomingMsg = value.messages[0]
    const phoneNumberId = value.metadata?.phone_number_id
    const fromPhone = incomingMsg.from
    const messageText = incomingMsg.text?.body || ''
    const waMessageId = incomingMsg.id

    if (!messageText || !phoneNumberId) {
      return NextResponse.json({ status: 'no_text' })
    }

    // Find agent by their WhatsApp phone number ID
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('*')
      .eq('wa_phone_number_id', phoneNumberId)
      .eq('wa_verified', true)
      .single()

    if (!agent) {
      console.error('No agent found for phone_number_id:', phoneNumberId)
      return NextResponse.json({ status: 'agent_not_found' })
    }

    // Check bot is active
    if (!agent.bot_active) {
      return NextResponse.json({ status: 'bot_paused' })
    }

    // Check message limit
    if (agent.messages_used >= agent.messages_limit) {
      console.log('Message limit reached for agent:', agent.id)
      return NextResponse.json({ status: 'limit_reached' })
    }

    // Find or create lead
    let { data: lead } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('agent_id', agent.id)
      .eq('phone', fromPhone)
      .single()

    const now = new Date().toISOString()
    const windowExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    if (!lead) {
      // New lead
      const { data: newLead } = await supabaseAdmin
        .from('leads')
        .insert({
          agent_id: agent.id,
          phone: fromPhone,
          last_message_at: now,
          window_expires_at: windowExpiry,
          status: 'new',
          temperature: 'new'
        })
        .select()
        .single()

      lead = newLead

      // Log activity
      await supabaseAdmin.from('activity_log').insert({
        agent_id: agent.id,
        lead_id: lead.id,
        type: 'lead_created',
        title: 'New lead created',
        description: `First message received from ${fromPhone}`
      })
    } else {
      // Update last message and reset window
      await supabaseAdmin
        .from('leads')
        .update({
          last_message_at: now,
          window_expires_at: windowExpiry
        })
        .eq('id', lead.id)
    }

    // If bot is paused (manual takeover), don't reply
    if (lead.bot_paused) {
      // Still save the message
      await supabaseAdmin.from('messages').insert({
        lead_id: lead.id,
        agent_id: agent.id,
        direction: 'inbound',
        content: messageText,
        wa_message_id: waMessageId,
        sent_by: 'lead'
      })
      return NextResponse.json({ status: 'manual_mode' })
    }

    // Save inbound message
    await supabaseAdmin.from('messages').insert({
      lead_id: lead.id,
      agent_id: agent.id,
      direction: 'inbound',
      content: messageText,
      wa_message_id: waMessageId,
      sent_by: 'lead'
    })

    // Generate bot reply via Gemini
    const { reply, metadata } = await generateBotReply(agent.id, lead.id, messageText)

    // Update lead with metadata from Gemini
    const leadUpdates: any = { updated_at: now }
    if (metadata.score) leadUpdates.ai_score = metadata.score
    if (metadata.temperature) leadUpdates.temperature = metadata.temperature
    if (metadata.intent) leadUpdates.intent = metadata.intent
    if (metadata.areas) leadUpdates.preferred_areas = metadata.areas
    if (metadata.budget_min) leadUpdates.budget_min = metadata.budget_min
    if (metadata.budget_max) leadUpdates.budget_max = metadata.budget_max
    if (metadata.timeline) leadUpdates.timeline = metadata.timeline
    if (metadata.name) leadUpdates.name = metadata.name

    // Update lead status based on score
    if (metadata.score >= 7) leadUpdates.status = 'qualified'
    else if (metadata.score >= 4) leadUpdates.status = 'contacted'

    await supabaseAdmin.from('leads').update(leadUpdates).eq('id', lead.id)

    // Log score update if changed
    if (metadata.score) {
      await supabaseAdmin.from('activity_log').insert({
        agent_id: agent.id,
        lead_id: lead.id,
        type: 'score_updated',
        title: `Lead score updated to ${metadata.score}/10`,
        description: `Temperature: ${metadata.temperature || 'unknown'}`
      })
    }

    // Send reply via WhatsApp
    const outWaId = await sendWhatsAppMessage(
      agent.wa_phone_number_id,
      agent.wa_access_token,
      fromPhone,
      reply
    )

    // Save outbound message
    await supabaseAdmin.from('messages').insert({
      lead_id: lead.id,
      agent_id: agent.id,
      direction: 'outbound',
      content: reply,
      wa_message_id: outWaId || undefined,
      sent_by: 'bot'
    })

    // Increment message counter (counts both inbound + outbound)
    await supabaseAdmin
      .from('agents')
      .update({ messages_used: agent.messages_used + 2 })
      .eq('id', agent.id)

    return NextResponse.json({ status: 'ok' })

  } catch (err: any) {
    console.error('Webhook error:', err)
    return NextResponse.json({ status: 'error', message: err.message }, { status: 500 })
  }
}
