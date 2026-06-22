export const dynamic = "force-dynamic"
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendWithRetry, waSendText, type WaChannel } from '@/lib/whatsapp'
import { verifySharedSecret, verifyMetaSignature } from '@/lib/webhookAuth'
import { createLogger } from '@/lib/logger'
import { checkRateLimit } from '@/lib/rateLimit'
import { handleAiBotMessage } from '@/lib/ai-bot'
import { randomUUID } from 'crypto'
import * as Sentry from '@sentry/nextjs'

// ─── GET: WhatsApp webhook verification ──────────────────────────────────────
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

// ─── POST: Inbound message handler ───────────────────────────────────────────
export async function POST(request: NextRequest) {
  const traceId = randomUUID()
  const { log, logError, setContext } = createLogger(traceId)

  // Dual-write helper (Step C: write both conversation_stage + state)
  const updateLeadStage = async (leadId: string, conversationStage: string, newState?: string) => {
    const updates: any = { conversation_stage: conversationStage }
    if (newState) updates.state = newState
    const { error } = await supabaseAdmin.from('leads').update(updates).eq('id', leadId)
    if (error) {
      logError('dual_write_failed', {
        stage: conversationStage,
        state: newState,
        error: error.message,
      })
    }
  }

  try {
    // Read the raw body ONCE — Meta signature verification needs exact bytes.
    const rawBody = await request.text()

    // ── Auth ─────────────────────────────────────────────────────────────
    // Accept either a valid Meta X-Hub-Signature-256 over the raw body (real
    // WhatsApp inbound) OR the shared-secret header (dashboard simulate form).
    {
      const devBypass = process.env.NODE_ENV !== 'production' && process.env.SKIP_WEBHOOK_AUTH === 'true'
      const metaOk = verifyMetaSignature(rawBody, request.headers.get('x-hub-signature-256'), process.env.WHATSAPP_APP_SECRET)
      const sharedSecret = process.env.MSG91_WEBHOOK_SECRET // legacy name; gates the simulate form
      const sharedOk = verifySharedSecret(request.headers.get('x-webhook-secret'), sharedSecret)
      if (devBypass) log('auth_bypass', { note: 'dev mode' })
      else if (!metaOk && !sharedOk) {
        logError('auth_rejected', {
          meta_sig_present: !!request.headers.get('x-hub-signature-256'),
          shared_present: !!request.headers.get('x-webhook-secret'),
        })
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // ── Rate limit ──────────────────────────────────────────────────────
    {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
      if (!checkRateLimit(`ip:${ip}`, 60, 60000).allowed) return NextResponse.json({ status: 'rate_limited' }, { status: 429 })
    }

    // ── Parse inbound ────────────────────────────────────────────────────
    // Two sources: Meta Cloud API (real WhatsApp) and the dashboard "simulate
    // lead" form post (forcedAgentId). MSG91 has been removed.
    const contentType = request.headers.get('content-type') || ''
    let fromPhone = '', messageText = '', waMessageId = '', forcedAgentId = '', metaPhoneNumberId = ''
    let isNonTextMedia = false

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(rawBody)
      fromPhone = (params.get('From') || '').replace('whatsapp:', '').trim()
      if (fromPhone && !fromPhone.startsWith('+')) fromPhone = '+' + fromPhone
      messageText = params.get('Body') || ''
      waMessageId = params.get('MessageSid') || ''
      forcedAgentId = params.get('AgentId') || ''
      if (!messageText || !fromPhone) return NextResponse.json({ status: 'no_text' })
    } else {
      let body: any = {}
      try { body = JSON.parse(rawBody) } catch {}
      if (body.object === 'whatsapp_business_account') {
        const value = body.entry?.[0]?.changes?.[0]?.value
        if (!value?.messages?.length) return NextResponse.json({ status: 'no_messages' })
        metaPhoneNumberId = value.metadata?.phone_number_id || ''
        const msg = value.messages[0]
        fromPhone = msg.from || ''
        messageText = msg.text?.body || ''
        waMessageId = msg.id || ''
        if (!messageText && msg.type && msg.type !== 'text') isNonTextMedia = true
        if (!messageText && !isNonTextMedia) return NextResponse.json({ status: 'no_text' })
      } else return NextResponse.json({ status: 'ignored' })
    }

    // ── Agent lookup ─────────────────────────────────────────────────────
    // Meta: identify the agent by the business phone number that received it.
    let agent: any = null
    if (metaPhoneNumberId) {
      const { data } = await supabaseAdmin.from('agents').select('*').eq('wa_phone_number_id', metaPhoneNumberId).maybeSingle()
      agent = data
    } else if (forcedAgentId) {
      const { data } = await supabaseAdmin.from('agents').select('*').eq('id', forcedAgentId).single()
      agent = data
    }
    if (!agent) return NextResponse.json({ status: 'agent_not_found' })
    setContext({ agentId: agent.id })

    // Reply channel — Meta Cloud API direct (agent's own WABA credentials).
    const channel: WaChannel = { phoneNumberId: agent.wa_phone_number_id, accessToken: agent.wa_access_token }

    // ── Agent rate limit ─────────────────────────────────────────────────
    {
      const al = checkRateLimit(`agent:${agent.id}`, 10, 60000)
      if (!al.allowed) return NextResponse.json({ status: 'rate_limited_agent' }, { status: 429 })
    }

    // ── Gate check ───────────────────────────────────────────────────────
    if (!agent.bot_active) return NextResponse.json({ status: 'bot_paused' })

    // ── Lead lookup / create ──────────────────────────────────────────────
    const now = new Date().toISOString()
    let { data: leads } = await supabaseAdmin.from('leads')
      .select('*').eq('agent_id', agent.id)
      .or(`phone.eq.${fromPhone},phone.eq.${fromPhone.replace('+', '')}`)
      .order('created_at', { ascending: false }).limit(1)
    let lead: any = leads?.[0] || null

    if (!lead) {
      // Omit conversation_stage from insert — it may not exist yet (pre-migration safety).
      const { data: nl } = await supabaseAdmin.from('leads').insert({
        agent_id: agent.id, phone: fromPhone, last_message_at: now,
        window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        status: 'new',
        opted_in: true, opt_in_at: now, opt_in_source: 'whatsapp_inbound'
      }).select().single()
      if (!nl) return NextResponse.json({ status: 'lead_create_failed' })
      lead = nl
      try { await supabaseAdmin.from('activity_log').insert({
        agent_id: agent.id, lead_id: lead.id, type: 'lead_created',
        title: 'New lead', description: fromPhone,
      }) } catch {}
    } else {
      await supabaseAdmin.from('leads').update({ last_message_at: now }).eq('id', lead.id)
    }
    setContext({ leadId: lead.id })

    // ── Opt-out ──────────────────────────────────────────────────────────
    const t = messageText.trim().toLowerCase()
    if (/^(stop|unsubscribe|opt[\s-]?out)\.?$/i.test(t) || /(stop|mat|nako).*(message|text)/i.test(t)) {
      await supabaseAdmin.from('leads').update({ opted_in: false }).eq('id', lead.id)
      const bye = "You're all set — I won't message you again. 🙏"
      try { await waSendText(channel, fromPhone, bye) } catch {}
      return NextResponse.json({ status: 'opted_out' })
    }

    // ── Dedup ────────────────────────────────────────────────────────────
    if (waMessageId) {
      const { data: dup } = await supabaseAdmin.from('messages').select('id').eq('wa_message_id', waMessageId).eq('direction', 'inbound').limit(1)
      if (dup?.length) return NextResponse.json({ status: 'duplicate' })
    }

    // ── Save inbound message ──────────────────────────────────────────────
    const { error: msgErr } = await supabaseAdmin.from('messages').insert({
      lead_id: lead.id, agent_id: agent.id, direction: 'inbound',
      content: messageText, wa_message_id: waMessageId || null, sent_by: 'lead'
    })
    if (msgErr) {
      if (msgErr.code === '23505') return NextResponse.json({ status: 'duplicate' })
      return NextResponse.json({ status: 'msg_insert_failed' })
    }

    if (lead.bot_paused) return NextResponse.json({ status: 'manual_mode' })

    // ── Guardrails: NSFW / spam / prompt injection ──────────────────────
    // Simple pattern-based check (no AI)
    const guardrailPatterns = [
      { pattern: /(sex|porn|xxx|nude|fuck)/i, label: 'sexual' },
      { pattern: /(\b\d{5,}\b.*\b(otp|password|login)\b)|(\b(otp|password)\b.*\b\d{5,}\b)/i, label: 'phishing' },
      { pattern: /(ignore|disregard).*(instruction|prompt|previous)|(you are|act as).*(human|bypass|system)/i, label: 'injection' },
    ]
    for (const g of guardrailPatterns) {
      if (g.pattern.test(messageText)) {
        const safeReply = "I'm here to help with property inquiries. Could you please ask something related to real estate? 🙏"
        const { data: gOut } = await supabaseAdmin.from('messages').insert({
          lead_id: lead.id, agent_id: agent.id, direction: 'outbound', content: safeReply, sent_by: 'bot',
        }).select('id').single()
        await sendWithRetry(() => waSendText(channel, fromPhone, safeReply))
        if (gOut?.id) await supabaseAdmin.from('messages').update({ status: 'sent' }).eq('id', gOut.id)
        return NextResponse.json({ status: 'guardrail', kind: g.label })
      }
    }

    // ═════════════════════════════════════════════════════════════════════
    // ── NEW AI-FIRST BOT ENGINE ──────────────────────────────────────────
    // ═════════════════════════════════════════════════════════════════════

    log('ai_bot_start', { phone: fromPhone, msg: messageText.slice(0, 80) })

    // Call new AI bot (handles everything: LLM, property search, message sends)
    await handleAiBotMessage({
      phone: fromPhone,
      message: messageText.trim(),
      agentId: agent.id,
      channel,
    })

    // Increment message counter
    try { await supabaseAdmin.rpc('increment_messages_used', { p_agent_id: agent.id, p_amount: 2 }) } catch {}

    log('ai_bot_complete', { phone: fromPhone })
    return NextResponse.json({ status: 'ok' })

  } catch (err: any) {
    logError('webhook_error', { error: err.message })
    Sentry.captureException(err)
    return NextResponse.json({ status: 'error' }, { status: 500 })
  }
}