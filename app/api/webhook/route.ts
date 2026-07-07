export const dynamic = "force-dynamic"
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendWithRetry, waSendText, type WaChannel } from '@/lib/whatsapp'
import { verifySharedSecret, verifyMetaSignature } from '@/lib/webhookAuth'
import { createLogger } from '@/lib/logger'
import { checkRateLimit } from '@/lib/rateLimit'
import { handleAiBotMessage } from '@/lib/ai-bot'
import { agentEntitlement } from '@/lib/entitlement'
import { newInboundLeadDefaults } from '@/lib/bot/newLeadDefaults'
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
      const sharedSecret = process.env.WEBHOOK_SIMULATE_SECRET // legacy name; gates the simulate form
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
    // lead" form post (forcedAgentId). the legacy provider has been removed.
    const contentType = request.headers.get('content-type') || ''
    let fromPhone = '', messageText = '', waMessageId = '', forcedAgentId = '', metaPhoneNumberId = ''
    let isNonTextMedia = false
    const inboundMessages: Array<{
      fromPhone: string
      messageText: string
      waMessageId: string
      isNonTextMedia: boolean
    }> = []

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(rawBody)
      let fromPhone = (params.get('From') || '').replace('whatsapp:', '').trim()
      if (fromPhone && !fromPhone.startsWith('+')) fromPhone = '+' + fromPhone
      const messageText = params.get('Body') || ''
      const waMessageId = params.get('MessageSid') || ''
      forcedAgentId = params.get('AgentId') || ''
      if (!messageText || !fromPhone) return NextResponse.json({ status: 'no_text' })
      inboundMessages.push({ fromPhone, messageText, waMessageId, isNonTextMedia: false })
    } else {
      let body: any = {}
      try { body = JSON.parse(rawBody) } catch {}
      if (body.object === 'whatsapp_business_account') {
        const value = body.entry?.[0]?.changes?.[0]?.value
        if (!value?.messages?.length) return NextResponse.json({ status: 'no_messages' })
        metaPhoneNumberId = value.metadata?.phone_number_id || ''
        const msg = value.messages[0]
        fromPhone = msg.from || ''
        messageText =
          msg.text?.body ||
          // Template quick-reply buttons arrive as type:'button' (button.text/payload) —
          // without this, a customer tapping a button on a nurture template sent an
          // empty message and got the "Sorry, I didn't catch that" fallback.
          msg.button?.text ||
          msg.button?.payload ||
          msg.interactive?.button_reply?.title ||
          msg.interactive?.list_reply?.title ||
          ''
        waMessageId = msg.id || ''
        if (!messageText && msg.type && msg.type !== 'text') isNonTextMedia = true
        if (messageText || isNonTextMedia) {
          inboundMessages.push({ fromPhone, messageText, waMessageId, isNonTextMedia })
        }

        for (const extraMsg of value.messages.slice(1)) {
          const extraText =
            extraMsg.text?.body ||
            extraMsg.button?.text ||
            extraMsg.button?.payload ||
            extraMsg.interactive?.button_reply?.title ||
            extraMsg.interactive?.list_reply?.title ||
            ''
          const extraIsNonTextMedia = !extraText && !!extraMsg.type && extraMsg.type !== 'text'
          if (!extraText && !extraIsNonTextMedia) continue
          inboundMessages.push({
            fromPhone: extraMsg.from || '',
            messageText: extraText,
            waMessageId: extraMsg.id || '',
            isNonTextMedia: extraIsNonTextMedia,
          })
        }
        for (const entry of body.entry || []) {
          for (const change of entry.changes || []) {
            const extraValue = change.value
            if (!extraValue?.messages?.length || extraValue === value) continue
            const phoneNumberId = extraValue.metadata?.phone_number_id || ''
            if (phoneNumberId) {
              if (metaPhoneNumberId && metaPhoneNumberId !== phoneNumberId) {
                logError('mixed_agent_batch', { first: metaPhoneNumberId, next: phoneNumberId })
                return NextResponse.json({ status: 'mixed_agent_batch' }, { status: 400 })
              }
              metaPhoneNumberId = phoneNumberId
            }
            for (const extraMsg of extraValue.messages) {
              const extraText =
                extraMsg.text?.body ||
                extraMsg.button?.text ||
                extraMsg.button?.payload ||
                extraMsg.interactive?.button_reply?.title ||
                extraMsg.interactive?.list_reply?.title ||
                ''
              const extraIsNonTextMedia = !extraText && !!extraMsg.type && extraMsg.type !== 'text'
              if (!extraText && !extraIsNonTextMedia) continue
              inboundMessages.push({
                fromPhone: extraMsg.from || '',
                messageText: extraText,
                waMessageId: extraMsg.id || '',
                isNonTextMedia: extraIsNonTextMedia,
              })
            }
          }
        }
      } else return NextResponse.json({ status: 'ignored' })
    }

    // ── Agent lookup ─────────────────────────────────────────────────────
    // Meta: identify the agent by the business phone number that received it.
    if (!inboundMessages.length) return NextResponse.json({ status: 'no_messages' })

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

    // ── Gate check: paused, or subscription/trial entitlement ─────────────
    const ent = agentEntitlement(agent)
    if (!ent.entitled) {
      log('not_entitled', { agentId: agent.id, reason: ent.reason })
      return NextResponse.json({ status: 'not_entitled', reason: ent.reason })
    }

    // ── Lead lookup / create ──────────────────────────────────────────────
    const results: any[] = []
    for (const inbound of inboundMessages) {
      fromPhone = inbound.fromPhone
      messageText = inbound.messageText
      waMessageId = inbound.waMessageId
      isNonTextMedia = inbound.isNonTextMedia
      try {

    const now = new Date().toISOString()
    let { data: leads } = await supabaseAdmin.from('leads')
      .select('*').eq('agent_id', agent.id)
      .or(`phone.eq.${fromPhone},phone.eq.${fromPhone.replace('+', '')}`)
      .order('created_at', { ascending: false }).limit(1)
    let lead: any = leads?.[0] || null

    if (!lead) {
      // Omit conversation_stage from insert — it may not exist yet (pre-migration safety).
      const { data: nl } = await supabaseAdmin.from('leads').insert({
        agent_id: agent.id,
        ...newInboundLeadDefaults(fromPhone, now),
      }).select().single()
      if (!nl) {
        results.push({ phone: fromPhone, status: 'lead_create_failed' })
        continue
      }
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
      results.push({ phone: fromPhone, status: 'opted_out' })
      continue
    }

    // ── Dedup ────────────────────────────────────────────────────────────
    if (waMessageId) {
      const { data: dup } = await supabaseAdmin.from('messages').select('id').eq('wa_message_id', waMessageId).eq('direction', 'inbound').limit(1)
      if (dup?.length) {
        results.push({ phone: fromPhone, status: 'duplicate' })
        continue
      }
    }

    // ── Save inbound message ──────────────────────────────────────────────
    const { error: msgErr } = await supabaseAdmin.from('messages').insert({
      lead_id: lead.id, agent_id: agent.id, direction: 'inbound',
      content: messageText, wa_message_id: waMessageId || null, sent_by: 'lead'
    })
    if (msgErr) {
      results.push({ phone: fromPhone, status: msgErr.code === '23505' ? 'duplicate' : 'msg_insert_failed' })
      continue
    }

    // Manual mode = agent is handling this conversation: the bot stays SILENT and
    // never replies. Resuming happens only in the background (cron auto-resumes a
    // lead after 5 min of silence), so the bot only speaks again once resumed.
    if (lead.bot_paused) {
      results.push({ phone: fromPhone, status: 'manual_mode' })
      continue
    }

    // ── Guardrails: NSFW / spam / prompt injection ──────────────────────
    // Simple pattern-based check (no AI)
    const guardrailPatterns = [
      { pattern: /(sex|porn|xxx|nude|fuck)/i, label: 'sexual' },
      { pattern: /(\b\d{5,}\b.*\b(otp|password|login)\b)|(\b(otp|password)\b.*\b\d{5,}\b)/i, label: 'phishing' },
      { pattern: /(ignore|disregard).*(instruction|prompt|previous)|(you are|act as).*(human|bypass|system)/i, label: 'injection' },
    ]
    let blockedByGuard = false
    for (const g of guardrailPatterns) {
      if (g.pattern.test(messageText)) {
        const safeReply = "I'm here to help with property inquiries. Could you please ask something related to real estate? 🙏"
        const { data: gOut } = await supabaseAdmin.from('messages').insert({
          lead_id: lead.id, agent_id: agent.id, direction: 'outbound', content: safeReply, sent_by: 'bot',
        }).select('id').single()
        await sendWithRetry(() => waSendText(channel, fromPhone, safeReply))
        if (gOut?.id) await supabaseAdmin.from('messages').update({ status: 'sent' }).eq('id', gOut.id)
        results.push({ phone: fromPhone, status: 'guardrail', kind: g.label })
        blockedByGuard = true
        break
      }
    }
    if (blockedByGuard) continue

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
    results.push({ phone: fromPhone, status: 'ok' })
      } catch (messageErr: any) {
        logError('message_process_failed', { phone: fromPhone, error: messageErr?.message || String(messageErr) })
        results.push({ phone: fromPhone, status: 'error' })
      }
    }
    return NextResponse.json({ status: 'ok', processed: results.length, results })

  } catch (err: any) {
    logError('webhook_error', { error: err.message })
    Sentry.captureException(err)
    return NextResponse.json({ status: 'error' }, { status: 500 })
  }
}
