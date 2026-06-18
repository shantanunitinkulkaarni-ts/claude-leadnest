export const dynamic = "force-dynamic"
// Engine can take a GLM attempt (8s) + retry (20s) + DB work — without this Vercel
// kills the function mid-run and Meta/MSG91 retry the webhook, causing double replies.
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { generateBotReply } from '@/lib/gemini'
import { sendWhatsAppMessage, sendViaMsg91, sendViaMsg91Media, sendMetaImage, sendWithRetry, sendViaMsg91Template, deductWABalance } from '@/lib/whatsapp'
import { wantsPhotos, botPromisedPhotos, extractPropertyMedia, MAX_IMAGES_PER_SEND } from '@/lib/media'
import { buildAgentContactCard } from '@/lib/fallbackCard'
import { callLLM } from '@/lib/llm'
import { parseBudgetRupees, isGrosslyOffBudget } from '@/lib/budgetParse'
import { shouldBotReply } from '@/lib/botGating'
import { resolveAppointmentTime, formatIST } from '@/lib/appointment'
import { isConfirmationReply, isPendingAppointmentExpired } from '@/lib/appointmentConfirmation'
import { detectInboundSignals, detectReplyKnowledgeGap, topSignal, SIGNAL_LABELS, type PrioritySignal } from '@/lib/intentSignals'
import { buildAlertContent, guardrailReply } from '@/lib/priorityAlerts'
import { recordKnowledgeGap } from '@/lib/knowledgeGaps'
import { verifySharedSecret } from '@/lib/webhookAuth'
import { createLogger } from '@/lib/logger'
import { checkRateLimit } from '@/lib/rateLimit'
import { randomUUID } from 'crypto'
import * as Sentry from '@sentry/nextjs'

const IP_RATE_LIMIT = 60       // requests / minute / IP
const AGENT_RATE_LIMIT = 10    // requests / minute / agent
const RATE_LIMIT_WINDOW_MS = 60_000

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
  const tStart = Date.now()
  const traceId = randomUUID()
  const { log, logError, setContext } = createLogger(traceId)
  try {
    // ── Webhook authentication ────────────────────────────────────────────────
    // MSG91 does not sign payloads with HMAC. Their mechanism is a custom header
    // you configure in the MSG91 dashboard: set header name "x-webhook-secret"
    // to the value of MSG91_WEBHOOK_SECRET, and MSG91 echoes it on every POST.
    //
    // This check runs BEFORE any body parsing, agent lookup, or DB work.
    // A forged POST (missing or wrong header) is rejected here with 403.
    //
    // TODO (Meta): When Meta App Review completes and the Meta Cloud API path
    // goes live, add X-Hub-Signature-256 HMAC verification here using
    // WHATSAPP_APP_SECRET. See the stub + activation checklist in lib/webhookAuth.ts.
    {
      const secret = process.env.MSG91_WEBHOOK_SECRET
      const devBypass =
        process.env.NODE_ENV !== 'production' &&
        process.env.SKIP_WEBHOOK_AUTH === 'true'

      if (devBypass) {
        log('auth_bypass', { note: 'SKIP_WEBHOOK_AUTH=true — dev only' })
      } else if (!secret) {
        logError('auth_misconfigured', { note: 'MSG91_WEBHOOK_SECRET is not set — rejecting all requests' })
        return NextResponse.json({ error: 'Webhook auth misconfigured' }, { status: 500 })
      } else if (!verifySharedSecret(request.headers.get('x-webhook-secret'), secret)) {
        log('auth_rejected', { note: 'invalid or missing x-webhook-secret' })
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── IP rate limit ───────────────────────────────────────────────────────
    // Cheapest possible check — runs before any body parsing or DB work, so a
    // hammering IP never costs us an LLM call or a write.
    {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
      const ipLimit = checkRateLimit(`ip:${ip}`, IP_RATE_LIMIT, RATE_LIMIT_WINDOW_MS)
      if (!ipLimit.allowed) {
        log('rate_limited_ip', { ip })
        return NextResponse.json({ status: 'rate_limited' }, { status: 429 })
      }
    }

    const contentType = request.headers.get('content-type') || ''
    let fromPhone = '', messageText = '', waMessageId = '', phoneNumberId = '', forcedAgentId = ''
    let incomingProvider: 'meta' | 'msg91' = 'meta'
    let msg91IntegratedNumber = ''
    // Meta Cloud API non-text inbound (voice note/image/etc.) — flagged here,
    // handled after agent lookup below since sending the nudge needs agent.wa_access_token.
    let isNonTextMedia = false

    if (contentType.includes('application/x-www-form-urlencoded')) {
      // Form-encoded inbound = the dashboard "simulate lead message" feature
      // (InboxScreen) and test harnesses, which post From/Body/AgentId. Carries
      // an explicit AgentId so it's routed via forcedAgentId below.
      const text = await request.text()
      const params = new URLSearchParams(text)
      fromPhone = (params.get('From') || '').replace('whatsapp:', '').trim()
      // Normalize: always ensure + prefix for consistent DB matching
      if (fromPhone && !fromPhone.startsWith('+')) fromPhone = '+' + fromPhone
      messageText = params.get('Body') || ''
      waMessageId = params.get('MessageSid') || ''
      forcedAgentId = params.get('AgentId') || ''
      phoneNumberId = 'simulated'
      if (!messageText || !fromPhone) return NextResponse.json({ status: 'no_text' })
    } else {
      const body = await request.json()
      // ── MSG91 (BSP) inbound — detected by its distinctive fields ──
      if (body.integratedNumber && (body.customerNumber || body.messages)) {
        incomingProvider = 'msg91'
        msg91IntegratedNumber = String(body.integratedNumber)
        fromPhone = body.customerNumber ? '+' + String(body.customerNumber).replace(/^\+/, '') : ''
        waMessageId = body.uuid || ''
        // Extract the text from a plain message OR a quick-reply button tap OR an
        // interactive reply — our templates use quick-reply buttons, which arrive
        // as a different content type with the text NOT in `body.text`.
        const pick = (...xs: any[]) => { for (const x of xs) if (typeof x === 'string' && x.trim()) return x; return '' }
        // body.button may arrive as a JSON string e.g. '{"payload":"Yes...","text":"Yes..."}'
        let btn = body.button
        if (typeof btn === 'string') { try { btn = JSON.parse(btn) } catch { /* leave as string */ } }
        messageText = pick(
          body.text,
          btn?.text, btn?.payload, btn?.title, btn?.value,
          typeof body.button === 'string' && !body.button.startsWith('{') ? body.button : '',
          body.buttonText, body.button_text, body.payload, body.buttonPayload,
          body.interactive?.button_reply?.title, body.interactive?.button_reply?.id,
          body.interactive?.list_reply?.title, body.interactive?.list_reply?.id,
          body.content?.text, typeof body.content === 'string' ? body.content : '',
          body.message?.text, body.title,
        )
        const ct = body.contentType
        // Only ignore genuinely unsupported media types — keep text/button/interactive.
        if (ct && !['text', 'button', 'interactive', 'reply', 'quick_reply'].includes(ct) && !messageText) {
          // Send a friendly nudge so the lead isn't ghosted (e.g. they sent a voice note or photo).
          if (fromPhone && msg91IntegratedNumber) {
            try { await sendViaMsg91(msg91IntegratedNumber, fromPhone, "I can only read text messages — could you type your question? I'm happy to help! 😊") } catch { /* best-effort */ }
          }
          return NextResponse.json({ status: 'ignored_non_text' })
        }
        if (!messageText || !fromPhone) {
          // Full payload (not truncated) so we can map any unexpected button shape.
          log('msg91_no_text_extracted', { payload: body })
          return NextResponse.json({ status: 'no_text' })
        }
        // Diagnostic: does this inbound carry a stable id (body.uuid)? The atomic
        // dedup that stops webhook-retry double-replies is keyed on wa_message_id
        // (=body.uuid). If button taps arrive with an EMPTY uuid, their retries
        // can't be deduped — this log tells us whether that gap is real before we
        // harden it. Safe to remove once confirmed.
        log('msg91_inbound', { contentType: body.contentType || '?', uuid: body.uuid ? 'present' : 'EMPTY', textLen: messageText.length })
      } else if (body.object === 'whatsapp_business_account') {
        // ── Meta Cloud API inbound ──
        const value = body.entry?.[0]?.changes?.[0]?.value
        if (!value?.messages?.length) return NextResponse.json({ status: 'no_messages' })
        const incomingMsg = value.messages[0]
        phoneNumberId = value.metadata?.phone_number_id || ''
        fromPhone = incomingMsg.from || ''
        messageText = incomingMsg.text?.body || ''
        waMessageId = incomingMsg.id || ''
        // Genuinely unsupported media (voice note, image, video, document, sticker,
        // location...) arrives with no `text` field but a known `type` — nudge the
        // lead to type instead, mirroring the MSG91 path above, rather than going dark.
        if (!messageText && incomingMsg.type && incomingMsg.type !== 'text') isNonTextMedia = true
        if (!messageText && !isNonTextMedia) return NextResponse.json({ status: 'no_text' })
        if (!phoneNumberId) return NextResponse.json({ status: 'no_text' })
      } else {
        return NextResponse.json({ status: 'ignored' })
      }
    }

    let agent: any = null
    if (incomingProvider === 'msg91') {
      // Map the MSG91 business number that received the message → its owning agent
      // (multi-tenant). Numbers are stored digits-only; normalise before matching.
      const inboundNum = msg91IntegratedNumber.replace(/\D/g, '')
      if (inboundNum) {
        const { data } = await supabaseAdmin
          .from('agents').select('*')
          .eq('msg91_integrated_number', inboundNum)
          .maybeSingle()
        agent = data
      }
      // Fallback for single-number setups (e.g. founder's own test SIM): route to
      // the agent named in MSG91_TEST_AGENT_ID when no number match is found.
      if (!agent) {
        const testId = process.env.MSG91_TEST_AGENT_ID
        if (testId) {
          const { data } = await supabaseAdmin.from('agents').select('*').eq('id', testId).single()
          agent = data
        }
      }
    } else if (forcedAgentId) {
      const { data } = await supabaseAdmin.from('agents').select('*').eq('id', forcedAgentId).single()
      agent = data
    } else {
      const { data } = await supabaseAdmin.from('agents').select('*').eq('wa_phone_number_id', phoneNumberId).eq('wa_verified', true).single()
      agent = data
    }

    if (!agent) {
      log('agent_not_found')
      return NextResponse.json({ status: 'agent_not_found' })
    }
    setContext({ agentId: agent.id })
    Sentry.setContext('webhook', { traceId, agentId: agent.id })

    // ── Per-agent rate limit ────────────────────────────────────────────────
    // Caps one agent's number looping/storming the webhook (buggy automation,
    // misconfigured retry on their side) from burning the LLM budget shared
    // across all agents. Below the gate checks (bot off/limit reached) so it
    // applies even while those are otherwise permissive.
    {
      const agentLimit = checkRateLimit(`agent:${agent.id}`, AGENT_RATE_LIMIT, RATE_LIMIT_WINDOW_MS)
      if (!agentLimit.allowed) {
        log('rate_limited_agent', { agentId: agent.id })
        return NextResponse.json({ status: 'rate_limited' }, { status: 429 })
      }
    }

    // Agent-level gates (bot off / limit reached / subscription lapsed),
    // centralised + unit-tested in lib/botGating.ts. 'active' agents are never
    // blocked by expiry (protects demo/comp/legacy/trial-not-yet-expired).
    {
      const gate = shouldBotReply({
        bot_active: agent.bot_active,
        messages_used: agent.messages_used,
        messages_limit: agent.messages_limit,
        plan_status: agent.plan_status,
        plan_expires_at: agent.plan_expires_at,
      })
      if (!gate.reply) {
        log('bot_gated', { reason: gate.reason })
        return NextResponse.json({ status: gate.reason })
      }
    }

    // Early dedup: Meta/MSG91 retry deliveries, so the same message can arrive
    // more than once. Cheap pre-check here; the authoritative guard is the
    // unique-index-protected insert below (atomic, race-proof).
    if (waMessageId) {
      const { data: existing } = await supabaseAdmin.from('messages').select('id').eq('wa_message_id', waMessageId).eq('direction', 'inbound').limit(1)
      if (existing && existing.length > 0) {
        return NextResponse.json({ status: 'duplicate' })
      }
    }

    if (isNonTextMedia) {
      try { await sendWhatsAppMessage(agent.wa_phone_number_id, agent.wa_access_token, fromPhone, "I can only read text messages — could you type your question? I'm happy to help! 😊") } catch { /* best-effort */ }
      return NextResponse.json({ status: 'ignored_non_text' })
    }

    const now = new Date().toISOString()
    const windowExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    let { data: leads } = await supabaseAdmin.from('leads')
      .select('*')
      .eq('agent_id', agent.id)
      .or(`phone.eq.${fromPhone},phone.eq.${fromPhone.replace('+', '')}`)
      .order('created_at', { ascending: false })
      .limit(1)
      
    let lead: any = leads?.[0] || null

    if (!lead) {
      const { data: newLead, error: leadInsertError } = await supabaseAdmin.from('leads').insert({
        agent_id: agent.id, phone: fromPhone, last_message_at: now,
        window_expires_at: windowExpiry, status: 'new', temperature: 'new',
        // Lead messaged the business first → implied opt-in consent (Meta-compliant)
        opted_in: true, opt_in_at: now, opt_in_source: 'whatsapp_inbound'
      }).select().single()

      if (leadInsertError) {
        if (leadInsertError.code === '23505') {
          // Race condition: another concurrent webhook request just created this lead
          // (hit the unique constraint on agent_id, phone). Fetch the winner row.
          const { data: raceLead } = await supabaseAdmin.from('leads')
            .select('*').eq('agent_id', agent.id).eq('phone', fromPhone).maybeSingle()
          if (!raceLead) {
            logError('lead_race_fetch_failed', { error: leadInsertError })
            return NextResponse.json({ status: 'lead_create_failed' })
          }
          lead = raceLead
          // No activity_log for the race loser — the winner already logged it
        } else {
          logError('lead_create_failed', { error: leadInsertError })
          return NextResponse.json({ status: 'lead_create_failed' })
        }
      } else if (!newLead) {
        return NextResponse.json({ status: 'lead_create_failed' })
      } else {
        lead = newLead
      }

      if (lead && !leadInsertError) {
        await supabaseAdmin.from('activity_log').insert({
          agent_id: agent.id, lead_id: lead.id, type: 'lead_created',
          title: 'New lead created', description: `First message from ${fromPhone}`
        })
      }
    } else {
      // Lead replied → window reopens AND both follow-up lifecycles reset:
      // the free 3h/10h/23h nudges and the paid template re-engagement. A reply
      // also revives a lead we'd marked 'dormant'.
      await supabaseAdmin.from('leads').update({
        last_message_at: now, window_expires_at: windowExpiry,
        window_nudge_count: 0, last_nudge_at: null,
        template_touches: 0, last_template_at: null, nurture_state: 'active',
      }).eq('id', lead.id)
      // Also reset nurture-flow v2 state (a reply restarts the timeline in-window).
      // Separate + tolerant: these columns may not exist until 02_nurture_flow.sql
      // is applied — a failure here must not break inbound handling.
      try {
        await supabaseAdmin.from('leads').update({ nurture_plan: null, plan_d_touches: 0 }).eq('id', lead.id)
      } catch { /* columns not present yet — safe to ignore */ }
    }
    setContext({ leadId: lead.id })
    Sentry.setContext('webhook', { traceId, agentId: agent.id, leadId: lead.id })

    // ── Opt-out / STOP handling (ban-safety + respect) ──
    // If the lead clearly asks to stop, never message them again. Honoring this
    // protects the WhatsApp number's quality rating (and is just decent).
    // Tightened to avoid false positives like "can I stop by your office?":
    // a bare STOP/UNSUBSCRIBE (whole message) OR an explicit "don't message me".
    const t = messageText.trim().toLowerCase()
    const isBareStop = /^(stop|unsubscribe|opt[\s-]?out|stop messaging|stop messages)\.?$/i.test(t)
    const isExplicitOptOut = /(do ?n.?t|stop|please stop|mat) (message|messaging|contact|text|texting)|unsubscribe me|message mat karo|message मत|मेसेज मत|मेसेज नको|मेसेज बंद/i.test(t)
    // Exact text of the "Stop updates" quick-reply buttons on our templates (en/hi/mr).
    const optOutButtons = ['stop updates', 'अपडेट बंद करें', 'अपडेट बंद करा']
    const isButtonOptOut = optOutButtons.includes(t)
    if (isBareStop || isExplicitOptOut || isButtonOptOut) {
      await supabaseAdmin.from('leads').update({
        opted_in: false, nurture_state: 'opted_out', bot_paused: true,
      }).eq('id', lead.id)
      await supabaseAdmin.from('activity_log').insert({
        agent_id: agent.id, lead_id: lead.id, type: 'opted_out',
        title: 'Lead opted out', description: 'Lead asked to stop messages — bot silenced for this lead.',
      })
      const bye = "You're all set — I won't message you again. If you ever need anything, just text here anytime. 🙏"
      try {
        if (incomingProvider === 'msg91') await sendViaMsg91(msg91IntegratedNumber, fromPhone, bye)
        else await sendWhatsAppMessage(agent.wa_phone_number_id, agent.wa_access_token, fromPhone, bye)
      } catch { /* best-effort */ }
      return NextResponse.json({ status: 'opted_out' })
    }

    // Atomic dedup: the unique index on inbound wa_message_id makes this insert
    // fail with 23505 if a concurrent retry already recorded the same message —
    // the loser exits WITHOUT generating a second reply.
    //
    // Fallback for button taps with no UUID: Postgres doesn't enforce uniqueness
    // on NULL, so MSG91 webhook retries (same button tap ~30s later) can both
    // insert successfully and fire a double reply. Guard: if uuid is absent,
    // check if this lead already sent the same text in the last 60 seconds.
    if (!waMessageId) {
      const cutoff = new Date(Date.now() - 60_000).toISOString()
      const { data: recentDup } = await supabaseAdmin.from('messages')
        .select('id').eq('lead_id', lead.id).eq('direction', 'inbound')
        .eq('content', messageText).gt('created_at', cutoff).limit(1)
      if (recentDup?.length) {
        log('dedup_hit', { kind: 'no_uuid_content_match' })
        return NextResponse.json({ status: 'duplicate' })
      }
    }
    const { error: inboundInsertError } = await supabaseAdmin.from('messages').insert({
      lead_id: lead.id, agent_id: agent.id, direction: 'inbound',
      content: messageText, wa_message_id: waMessageId || null, sent_by: 'lead'
    })
    if (inboundInsertError) {
      if (inboundInsertError.code === '23505') {
        log('dedup_hit', { kind: 'unique_index' })
        return NextResponse.json({ status: 'duplicate' })
      }
      logError('inbound_message_insert_failed', { error: inboundInsertError })
      // Don't reply if we couldn't record the message — a retry will reprocess it cleanly.
      return NextResponse.json({ status: 'message_insert_failed' })
    }

    if (lead.bot_paused) {
      log('manual_mode', { note: 'lead bot_paused' })
      return NextResponse.json({ status: 'manual_mode' })
    }

    // ── Safety guardrails: deflect NSFW / spam-scam / prompt-injection WITHOUT
    //    invoking the sales engine (saves an LLM call and keeps the bot in role).
    const inboundSignals = detectInboundSignals(messageText)
    if (inboundSignals.guardrail) {
      const safeReply = guardrailReply(inboundSignals.guardrail)
      log('guardrail_tripped', { guardrail: inboundSignals.guardrail, note: 'engine skipped' })
      const { data: gOut } = await supabaseAdmin.from('messages').insert({
        lead_id: lead.id, agent_id: agent.id, direction: 'outbound', content: safeReply, sent_by: 'bot',
      }).select('id').single()
      try {
        let wid: string | null = null
        let gErr: string | null = null
        if (incomingProvider === 'msg91') { const r = await sendWithRetry(() => sendViaMsg91(msg91IntegratedNumber, fromPhone, safeReply)); wid = r.id; gErr = r.error }
        else { wid = await sendWhatsAppMessage(agent.wa_phone_number_id, agent.wa_access_token, fromPhone, safeReply); if (!wid) gErr = 'meta_send_returned_null' }
        if (gOut?.id) {
          if (wid) await supabaseAdmin.from('messages').update({ wa_message_id: wid }).eq('id', gOut.id)
          else {
            // Send rejected — record reason for superadmins only (item #1).
            await supabaseAdmin.from('messages').update({
              status: 'failed', delivery_status: 'failed',
              delivery_error: (gErr || 'send_failed').slice(0, 500),
              delivery_updated_at: new Date().toISOString(),
            }).eq('id', gOut.id)
            Sentry.captureMessage('WhatsApp guardrail reply send failed', {
              level: 'error', extra: { agentId: agent.id, leadId: lead.id, reason: gErr },
            })
          }
        }
      } catch (e: any) { logError('guardrail_send_failed', { error: e?.message }) }
      await supabaseAdmin.from('activity_log').insert({
        agent_id: agent.id, lead_id: lead.id, type: 'guardrail',
        title: `Guardrail: ${inboundSignals.guardrail}`, description: messageText.slice(0, 140),
      })
      await supabaseAdmin.from('agents').update({ messages_used: (agent.messages_used || 0) + 1 }).eq('id', agent.id)
      return NextResponse.json({ status: 'guardrail', kind: inboundSignals.guardrail })
    }

    log('engine_call_start', { messageText })
    const tEngine = Date.now()
    let reply: string, metadata: any
    let engineFallback = false
    try {
      const result = await generateBotReply(agent.id, lead.id, messageText)
      reply = result.reply
      metadata = result.metadata
    } catch (engineErr: any) {
      logError('engine_error_fallback_used', { error: engineErr.message })
      // Agency-name-aware fallback. Better than a generic "Thank you" brush-off
      // when GLM and Cerebras both fail — references the agency so it doesn't
      // sound like a stranger replying, and explicitly tells the lead a human
      // teammate will follow up (the priority-alert path further down will
      // notify the agent so this isn't an empty promise).
      const agencyName = agent?.agency_name || 'our team'
      reply = `Thanks for the message! I'm having a brief tech hiccup right now — ${agencyName} will be in touch with you shortly. 🙏`
      metadata = {}
      engineFallback = true
    }
    log('engine_call_done', { durationMs: Date.now() - tEngine, reply, metadata, fallback: engineFallback })

    // ── Honesty intercept: rewrite photo-send promises when we can't actually send ──
    // The bot's prompt says don't promise photos when canSendPhotos=false, but the
    // model still complies with the lead's "send pics" request because compliance
    // is the path of least resistance. Without this server-side guard, the lead
    // hears "Sure, let me share the photos!" and then NO photos arrive — a textbook
    // trust-killer. We rewrite the offending sentence to an honest deferral that
    // points to the agent. (Mirrors the photo-send gate further below.)
    if (process.env.MSG91_MEDIA_LIVE !== 'true' && botPromisedPhotos(reply)) {
      const advisorName = agent?.name || 'our advisor'
      const advisorPhone = agent?.phone || null
      const original = reply
      reply = advisorPhone
        ? `I don't have direct photo-sharing enabled yet, but ${advisorName} can WhatsApp them to you straight away — reach them on ${advisorPhone}. Want me to flag this for them right now?`
        : `I don't have direct photo-sharing enabled yet — let me have ${advisorName} send them to you shortly. Anything specific you'd like a look at first?`
      logError('photo_promise_intercepted', { original, replacement: reply })
      Sentry.captureMessage('Photo promise intercepted (canSendPhotos=false)', {
        level: 'warning',
        extra: { agentId: agent.id, leadId: lead.id, original },
      })
    }
    if (engineFallback) {
      supabaseAdmin.from('activity_log').insert({
        agent_id: agent.id, lead_id: lead.id, type: 'engine_fallback',
        title: 'Engine fallback reply used', description: messageText.slice(0, 140),
      }).then(({ error }: any) => { if (error) Sentry.captureException(error) })
    }

    // Budget sanity guardrail: if the lead's message states a clear figure
    // ("50 lakh") but the LLM extracted something an order of magnitude off
    // (e.g. 5,00,000), trust the lead's words. Prevents mis-qualification +
    // broken property matching. Keeps budget_min <= budget_max (Phase 0 check).
    const textBudget = parseBudgetRupees(messageText)
    if (textBudget && isGrosslyOffBudget(metadata.budget_max, textBudget)) {
      const wasPoint = metadata.budget_min && metadata.budget_max && metadata.budget_min === metadata.budget_max
      log('budget_corrected', { fromMax: metadata.budget_max ?? null, to: textBudget })
      if (wasPoint || (metadata.budget_min && metadata.budget_min > textBudget)) metadata.budget_min = textBudget
      metadata.budget_max = textBudget
    }

    const leadUpdates: any = { updated_at: now, window_nudge_count: 0 }
    if (metadata.score) leadUpdates.ai_score = metadata.score
    if (metadata.temperature) leadUpdates.temperature = metadata.temperature
    if (metadata.intent) leadUpdates.intent = metadata.intent
    if (metadata.areas) leadUpdates.preferred_areas = metadata.areas
    if (metadata.budget_min) leadUpdates.budget_min = metadata.budget_min
    if (metadata.budget_max) leadUpdates.budget_max = metadata.budget_max
    if (metadata.timeline) leadUpdates.timeline = metadata.timeline
    if (metadata.name) leadUpdates.name = metadata.name
    if (metadata.lang && ['en', 'hi', 'mr'].includes(metadata.lang)) leadUpdates.language = metadata.lang
    // matched_property_id saved separately (column may not exist until migration runs)
    let safeMatchedPropId: string | null = null
    if (metadata.matched_property_id) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(metadata.matched_property_id)
      if (isUUID) safeMatchedPropId = metadata.matched_property_id
    }
    if (metadata.score >= 7) leadUpdates.status = 'qualified'
    else if (metadata.score >= 4) leadUpdates.status = 'contacted'

    // pending_appointment_* saved separately (columns may not exist until
    // pending_appointment_migration.sql has run) — same pattern as
    // safeMatchedPropId above, so a missing column never breaks the main
    // lead update (score/temperature/etc).
    let hasPendingApptUpdate = false
    const pendingApptUpdates: any = {}
    const setPendingAppt = (time: string | null, propertyId: string | null, setAt: string | null) => {
      hasPendingApptUpdate = true
      pendingApptUpdates.pending_appointment_time = time
      pendingApptUpdates.pending_appointment_property_id = propertyId
      pendingApptUpdates.pending_appointment_set_at = setAt
    }

    // 1. Check for Cancellation — also drops any pending (unconfirmed) hold.
    if (metadata.appointment_status === 'cancelled' || /(cancel|drop|abort)[\s\S]*?(visit|appointment|viewing|meeting)/i.test(reply)) {
       log('appt_cancellation_detected')
       leadUpdates.status = 'contacted'; // reset status
       setPendingAppt(null, null, null)

       const { data: existingAppts } = await supabaseAdmin
        .from('appointments')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('status', 'upcoming')
        .limit(1)

       if (existingAppts && existingAppts.length > 0) {
         await supabaseAdmin.from('appointments').update({ status: 'cancelled' }).eq('id', existingAppts[0].id);
         await supabaseAdmin.from('activity_log').insert({
            agent_id: agent.id, lead_id: lead.id, type: 'status_change',
            title: 'Site visit cancelled',
            description: 'Lead cancelled their scheduled site visit via WhatsApp.'
         })
       }
    } else if (
      lead.pending_appointment_time &&
      !isPendingAppointmentExpired(lead.pending_appointment_set_at) &&
      isConfirmationReply(messageText)
    ) {
      // 2. Lead explicitly confirmed a previously staged time — THIS is the
      // only path that ever writes to `appointments`. See lib/appointmentConfirmation.ts.
      log('appt_confirmation_detected', { note: 'promoting pending_appointment_time' })
      const scheduledIso = lead.pending_appointment_time
      const safePropertyId = lead.pending_appointment_property_id || null

      const { data: existingAppts } = await supabaseAdmin
        .from('appointments')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('status', 'upcoming')
        .limit(1)

      let blockedByRescheduleLimit = false

      if (existingAppts && existingAppts.length > 0) {
        // Troll detection: this is a reschedule of an already-confirmed visit.
        const { count: rescheduleCount } = await supabaseAdmin
          .from('activity_log')
          .select('*', { count: 'exact', head: true })
          .eq('lead_id', lead.id)
          .eq('title', 'Site visit rescheduled by AI')

        if (rescheduleCount !== null && rescheduleCount >= 3) {
          // Reschedule limit reached: block this confirmation and bring in a
          // human — but KEEP THE BOT ON for everything else.
          blockedByRescheduleLimit = true
          log('appt_reschedule_limit_blocked', { rescheduleCount })
          reply = "Noted! Since we've moved this a few times, our team will personally call you to lock in the final time — that way it's settled in one go. Meanwhile, I'm right here for anything else you'd like to know. 😊"

          const { data: prevHandover } = await supabaseAdmin
            .from('activity_log').select('id')
            .eq('lead_id', lead.id).eq('type', 'human_handover').limit(1)
          if (!prevHandover || prevHandover.length === 0) {
            await supabaseAdmin.from('activity_log').insert({
              agent_id: agent.id, lead_id: lead.id, type: 'human_handover',
              title: 'Action needed: call this lead to fix the visit time',
              description: `${lead.name || lead.phone} has rescheduled 3+ times. The bot has stopped changing the appointment — please call them to confirm a final time.`
            })
            try {
              const { sendHighPriorityAlert } = await import('@/lib/alerts')
              await sendHighPriorityAlert(agent, {
                subject: `Action needed: ${lead.name || lead.phone} keeps rescheduling — please call them`,
                html: `<p>Hi ${agent.name || ''},</p><p><strong>${lead.name || 'A lead'} (${lead.phone})</strong> has rescheduled their site visit 3+ times. Your AI assistant has stopped changing the appointment and told them your team will call to fix a final time.</p><p><strong>Please call them to confirm the visit.</strong> The bot is still answering their other questions in the meantime.</p>`,
                whatsappText: `🔴 Convorian — action needed\n\n${lead.name || 'A lead'} (${lead.phone}) has rescheduled their site visit 3+ times. The AI has locked the appointment and told them your team will call.\n\n📞 Please call them now to fix the final time — this lead is at risk.`,
                templateValues: [lead.name || 'A lead', lead.phone, 'rescheduled their site visit 3+ times — please call them to fix the final time'],
                msg91IntegratedNumber,
              })
            } catch (alertErr: any) {
              logError('handover_alert_failed', { error: alertErr?.message })
            }
          }
        }
      }

      // Always clear the pending hold once acted on — confirmed or blocked.
      setPendingAppt(null, null, null)

      if (!blockedByRescheduleLimit) {
        let apptData, apptError
        if (existingAppts && existingAppts.length > 0) {
          const res = await supabaseAdmin.from('appointments').update({
            scheduled_at: scheduledIso,
            property_id: safePropertyId || undefined,
          }).eq('id', existingAppts[0].id).select()
          apptData = res.data
          apptError = res.error
        } else {
          const res = await supabaseAdmin.from('appointments').insert({
            agent_id: agent.id,
            lead_id: lead.id,
            property_id: safePropertyId,
            scheduled_at: scheduledIso,
            status: 'upcoming',
          }).select()
          apptData = res.data
          apptError = res.error
        }

        if (apptError) logError('appt_confirm_save_failed', { error: apptError })
        else log('appt_confirm_save_success', { appointment: apptData })

        leadUpdates.status = 'visit_booked'
        await supabaseAdmin.from('activity_log').insert({
          agent_id: agent.id, lead_id: lead.id, type: 'visit_booked',
          title: existingAppts && existingAppts.length > 0 ? 'Site visit rescheduled by AI' : 'Site visit booked by AI',
          description: `Confirmed for ${formatIST(scheduledIso)} IST`,
        })

        reply = `Perfect, you're all set! ✅ Your site visit is confirmed for ${formatIST(scheduledIso)}. Our team will share the exact location details before the visit. Looking forward to it!`
      }
    } else {
      // Robustly resolve a real, IST-correct visit time (lib/appointment).
      // Replaces (a) the old chrono-only-when-the-model-omitted-it fallback and
      // (b) the now+24h fabrication that booked "tomorrow at the current time"
      // whenever the model's time was unparseable (the 6:58 PM bug). The resolver
      // tries the model's structured time, then natural language in the model
      // field, then the reply text the lead actually saw — and NEVER guesses.
      // Tightened booking intent detector. Previously matched a positive verb
      // OR an unrelated time word in isolation, so any cheerful "Perfect,
      // sounds good!" or "great" got treated as a booking attempt and risked
      // staging a pending appointment from thin air. The new requirement is
      // BOTH a confirmatory verb AND an actual time/day signal in the reply.
      // (The chrono-based resolveAppointmentTime still has the final say.)
      const POSITIVE_VERB = /(confirm(ed|ing)?|lock\s*in|schedul(ed|ing|e)|book(ed|ing)?|reschedul(ed|ing|e)?|chang(ed|ing)?\s+(to|the)\s+(time|visit)|pakka|pakki|finaliz)/i
      const TIME_SIGNAL = /(\b\d{1,2}\s*(:\s*\d{2})?\s*(am|pm|baje)\b|\b(today|tomorrow|kal|aaj|parso|day\s+after|next\s+(week|day))\b|\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|som|mangal|budh|guru|shukra|shani|ravi)\b|\b(morning|evening|afternoon|subah|sham|dopahar|raat)\b)/i
      const hasBookingIntent = (s: string) => POSITIVE_VERB.test(s) && TIME_SIGNAL.test(s)
      const inboundVisitRe = /(visit|site visit|dekhna|aana|aata|come|tomorrow|kal)\s.*(at\s+\d+|\d+\s*(am|pm)|baje|subah|sham|dopahar)/i
      const apptIntent = !!metadata.appointment_booked_time || hasBookingIntent(reply) || (inboundVisitRe.test(messageText) && hasBookingIntent(reply))
      if (apptIntent) {
        const resolved = resolveAppointmentTime({
          llmTime: metadata.appointment_booked_time,
          replyText: reply + ' ' + messageText,
          nowMs: Date.now(),
        })
        if (resolved.ok) {
          metadata.appointment_booked_time = resolved.iso
          log('appt_time_resolved', { iso: resolved.iso, ist: formatIST(resolved.iso), source: resolved.source })
        } else {
          // No trustworthy time — NEVER fabricate one. If the reply implied a
          // booking, ask the lead to confirm the exact day/time instead.
          log('appt_time_unresolved', { reason: resolved.reason })
          if (hasBookingIntent(reply)) {
            reply = "Happy to set that up! Could you confirm the exact day and time that works for your visit? For example: “tomorrow at 11:30 AM” or “Saturday at 5 PM”."
          }
          metadata.appointment_booked_time = null
        }
      }

      log('appt_intent_check', {
        bookedTime: metadata.appointment_booked_time || 'NOT SET',
        bookingIntentMatched: hasBookingIntent(reply),
        inboundVisitMatched: inboundVisitRe.test(messageText),
      })

    // HARD GUARD: never accept a visit outside the agent's office hours — the
    // model is told the hours but occasionally agrees anyway (e.g. "8pm is
    // fine" against 09:00-19:00). Server-side rule beats prompt hope.
    if (metadata.appointment_booked_time) {
      const checkDate = new Date(metadata.appointment_booked_time)
      if (!isNaN(checkDate.getTime())) {
        const ist = new Date(checkDate.getTime() + 5.5 * 60 * 60 * 1000)
        const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes()
        const [oH, oM] = String(agent.office_open || '09:00').split(':').map(Number)
        const [cH, cM] = String(agent.office_close || '19:00').split(':').map(Number)
        if (mins < oH * 60 + oM || mins > cH * 60 + cM) {
          log('appt_outside_office_hours', { mins, officeOpen: agent.office_open, officeClose: agent.office_close })
          metadata.appointment_booked_time = null
          const fmt = (t: string) => {
            const [h, m] = t.split(':').map(Number)
            const ampm = h >= 12 ? 'PM' : 'AM'
            const h12 = h % 12 === 0 ? 12 : h % 12
            return `${h12}${m ? ':' + String(m).padStart(2, '0') : ''} ${ampm}`
          }
          reply = `Apologies — site visits are only possible between ${fmt(String(agent.office_open || '09:00'))} and ${fmt(String(agent.office_close || '19:00'))}. Could we pick a time in that window? Morning or evening, whichever suits you better.`
        }
      }
    }

    // 3. A new time was resolved this turn — STAGE it as a pending hold and
    // ask the lead to explicitly confirm. Never write straight to `appointments`.
    const parsedDate = metadata.appointment_booked_time ? new Date(metadata.appointment_booked_time) : null
    if (parsedDate && !isNaN(parsedDate.getTime())) {
      let safePropertyId = null;
      if (metadata.matched_property_id) {
          const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(metadata.matched_property_id);
          safePropertyId = isUUID ? metadata.matched_property_id : null;
      }

      log('appt_pending_staged', { iso: parsedDate.toISOString() })
      setPendingAppt(parsedDate.toISOString(), safePropertyId, now)

      reply = `Perfect — I'll schedule your site visit for ${formatIST(parsedDate.toISOString())}. Just reply "Confirm" or "Yes" to lock it in, or let me know a different time that works better.`
    }
    }

    await supabaseAdmin.from('leads').update(leadUpdates).eq('id', lead.id)

    // Save matched_property_id separately — column may not exist until migration runs;
    // a failure here must NOT break the main lead update above.
    if (safeMatchedPropId) {
      try {
        await supabaseAdmin.from('leads').update({ matched_property_id: safeMatchedPropId }).eq('id', lead.id)
      } catch { /* column may not exist yet — safe to ignore */ }
    }

    // Save pending_appointment_* separately — columns may not exist until
    // pending_appointment_migration.sql has run; a failure here must NOT
    // break the main lead update above.
    if (hasPendingApptUpdate) {
      try {
        await supabaseAdmin.from('leads').update(pendingApptUpdates).eq('id', lead.id)
      } catch { /* columns may not exist yet — safe to ignore */ }
    }

    if (metadata.score) {
      await supabaseAdmin.from('activity_log').insert({
        agent_id: agent.id, lead_id: lead.id, type: 'score_updated',
        title: `Lead scored ${metadata.score}/10 — ${metadata.temperature || 'unknown'}`,
        description: `Intent: ${metadata.intent || '?'} | Budget: ${metadata.budget_min ? `₹${metadata.budget_min/100000}L` : '?'}`
      })
    }

    // ── Safe fallback CARD (messaging plan #3) ──────────────────────────────
    // When the bot can't safely answer, don't guess — reply with the agent's
    // contact card instead. Triggers:
    //   • engine fully down (both LLMs failed), or
    //   • the bot couldn't answer the question (knowledge gap / deferral).
    // The ORIGINAL engine reply is preserved (engineReply) so the knowledge-gap
    // recorder below still learns the right Q→A. (Price/possession fabrications
    // are already handled honestly inside the engine via validateReply/factGuard.)
    const engineReply = reply
    const isKnowledgeGap = !engineFallback && detectReplyKnowledgeGap(reply)
    const fallbackReason: 'engine_down' | 'knowledge_gap' | null =
      engineFallback ? 'engine_down' : (isKnowledgeGap ? 'knowledge_gap' : null)
    if (fallbackReason) {
      reply = buildAgentContactCard(agent)
      log('fallback_card_used', { reason: fallbackReason })
    }

    // Save bot reply to DB first — ensures simulation mode always shows the reply
    const { data: outboundMsg } = await supabaseAdmin.from('messages').insert({
      lead_id: lead.id, agent_id: agent.id, direction: 'outbound',
      content: reply, sent_by: 'bot'
    }).select('id').single()

    // Then attempt WhatsApp delivery (non-blocking — simulation works even if this fails)
    try {
      let outWaId: string | null = null
      let sendError: string | null = null
      if (incomingProvider === 'msg91') {
        // Retry momentary glitches up to 2 extra times (item #2); permanent
        // rejections (bad number / closed window) fail fast and fall to #1/#4.
        const r = await sendWithRetry(() => sendViaMsg91(msg91IntegratedNumber, fromPhone, reply))
        outWaId = r.id; sendError = r.error
      } else {
        outWaId = await sendWhatsAppMessage(agent.wa_phone_number_id, agent.wa_access_token, fromPhone, reply)
        if (!outWaId) sendError = 'meta_send_returned_null'
      }
      if (outboundMsg?.id) {
        if (outWaId) {
          // Stamp the exact row we just inserted (order/limit are not valid on updates).
          await supabaseAdmin.from('messages').update({ wa_message_id: outWaId }).eq('id', outboundMsg.id)
        } else {
          // The send was REJECTED. Record the real reason so WE (superadmins) can see
          // and fix it — this is NOT shown to the agent (the inbox doesn't render
          // message delivery status). Messaging-reliability item #1. (Retries + agent
          // alerts + after-24h template fallback are later items, not done here.)
          await supabaseAdmin.from('messages').update({
            status: 'failed', delivery_status: 'failed',
            delivery_error: (sendError || 'send_failed').slice(0, 500),
            delivery_updated_at: new Date().toISOString(),
          }).eq('id', outboundMsg.id)
        }
      }
      if (outWaId) {
        log('whatsapp_sent', { waMessageId: outWaId })
      } else {
        logError('whatsapp_send_failed', { reason: sendError })
        Sentry.captureMessage('WhatsApp reply send failed', {
          level: 'error',
          extra: { agentId: agent.id, leadId: lead.id, provider: incomingProvider, reason: sendError, messageRowId: outboundMsg?.id },
        })
      }
    } catch (waErr: any) {
      logError('whatsapp_send_failed', { error: waErr.message })
      Sentry.captureException(waErr, { extra: { agentId: agent.id, leadId: lead.id, where: 'reply_send' } })
    }

    // Atomic increment — avoids the lost-update race where two concurrent webhooks
    // both read messages_used=N and both write N+2, resulting in N+2 instead of N+4.
    await supabaseAdmin.rpc('increment_messages_used', { p_agent_id: agent.id, p_amount: 2 })

    // ── Share property photos when the lead asks (Convorian-held media only) ──
    // Gated by MSG91_MEDIA_LIVE so it stays inert until the media send format is
    // verified once via POST /api/admin/test-media. Sends the images stored on
    // the matched property (features "media:<url>"). Best-effort, capped.
    try {
      const shouldSendPhotos = wantsPhotos(messageText) || botPromisedPhotos(reply)
      if (process.env.MSG91_MEDIA_LIVE === 'true' && shouldSendPhotos) {
        log('photo_lookup_start')
        const isUUID = (s: any) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
        let prop: any = null

        // 1. Try matched_property_id from current metadata or stored on lead
        const propId = metadata.matched_property_id || lead.matched_property_id
        if (isUUID(propId)) {
          const { data } = await supabaseAdmin.from('properties')
            .select('id,title,features,property_media').eq('id', propId).eq('agent_id', agent.id).maybeSingle()
          prop = data
          if (prop) log('photo_matched_property_id', { title: prop.title })
        }

        // 2. Fallback: search recent bot messages for property title mentions
        if (!prop) {
          const { data: actives } = await supabaseAdmin.from('properties')
            .select('id,title,features,property_media').eq('agent_id', agent.id).eq('status', 'active').limit(20)
          const allProps = actives || []
          const withMedia = allProps.filter((p: any) => extractPropertyMedia(p).length)
          log('photo_no_matched_id', { totalProperties: allProps.length, withMedia: withMedia.length })

          if (withMedia.length > 0) {
            // Search the last few bot messages + current reply for property title mentions
            const { data: recentMsgs } = await supabaseAdmin.from('messages')
              .select('content').eq('lead_id', lead.id).eq('direction', 'outbound')
              .order('created_at', { ascending: false }).limit(5)
            const recentText = [reply, ...(recentMsgs || []).map((m: any) => m.content)].join(' ').toLowerCase()

            const titleMatches = withMedia.filter((p: any) => {
              const title = (p.title || '').toLowerCase()
              if (!title || title.length < 3) return false
              return recentText.includes(title)
            })
            if (titleMatches.length === 1) {
              prop = titleMatches[0]
              log('photo_matched_by_title', { title: prop.title })
            } else if (titleMatches.length > 1) {
              prop = titleMatches[0]
              log('photo_multiple_title_matches', { count: titleMatches.length, using: prop.title })
            } else if (withMedia.length === 1) {
              prop = withMedia[0]
              log('photo_only_media_property', { title: prop.title })
            } else {
              log('photo_property_undetermined', { withMediaCount: withMedia.length })
            }
          }
        }

        const media = prop ? extractPropertyMedia(prop).slice(0, MAX_IMAGES_PER_SEND) : []
        if (media.length) {
          log('photo_send_start', { count: media.length, title: prop.title, propertyId: prop.id })
          for (let i = 0; i < media.length; i++) {
            const caption = i === 0 ? (prop.title || 'Property') : undefined
            let mid: string | null = null
            let mErr: string | null = null
            if (incomingProvider === 'msg91') { const r = await sendWithRetry(() => sendViaMsg91Media(msg91IntegratedNumber, fromPhone, media[i], caption)); mid = r.id; mErr = r.error }
            else { mid = await sendMetaImage(agent.wa_phone_number_id, agent.wa_access_token, fromPhone, media[i], caption); if (!mid) mErr = 'meta_media_returned_null' }
            log('photo_send_result', { index: i + 1, total: media.length, ok: !!mid })
            await supabaseAdmin.from('messages').insert({
              lead_id: lead.id, agent_id: agent.id, direction: 'outbound',
              content: `[photo] ${prop.title || ''}`.trim(), sent_by: 'bot',
              wa_message_id: typeof mid === 'string' ? mid : null,
              // Record a failed photo send for superadmins only (item #1).
              ...(mid ? {} : {
                status: 'failed', delivery_status: 'failed',
                delivery_error: (mErr || 'send_failed').slice(0, 500),
                delivery_updated_at: new Date().toISOString(),
              }),
            })
            if (!mid) Sentry.captureMessage('WhatsApp photo send failed', {
              level: 'warning', extra: { agentId: agent.id, leadId: lead.id, reason: mErr, propertyId: prop.id },
            })
          }
        } else {
          log('photo_none_to_send', { prop: prop ? prop.title : 'none found', mediaCount: media.length })
        }
      }
    } catch (mediaErr: any) {
      logError('photo_share_failed', { error: mediaErr?.message })
    }

    // ── High-priority alerts to the agent (email + WhatsApp) ──
    // ROI-critical moments: visit booked, lead arriving now, wants a call/human,
    // very interested, the bot hit a knowledge gap, or a competitor is probing.
    // Best-effort + deduped per (lead, signal) within 3h so we never spam.
    try {
      const priorities: PrioritySignal[] = [...inboundSignals.priorities]
      if (metadata.appointment_booked_time) priorities.push('visit_booked')
      if ((metadata.score || 0) >= 8 && !priorities.includes('very_interested')) priorities.push('very_interested')
      // Use the precomputed gap flag — `reply` may now be the fallback card, so
      // re-detecting on it would miss the gap. Record the ORIGINAL deferral
      // (engineReply) so the agent/superadmin sees what the bot actually said.
      if (isKnowledgeGap && !priorities.includes('knowledge_gap')) {
        priorities.push('knowledge_gap')
        recordKnowledgeGap(agent.id, lead.id, messageText, engineReply).catch(err => Sentry.captureException(err))
      }

      const sig = topSignal(priorities)
      if (sig) {
        const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
        const { data: recentAlert } = await supabaseAdmin.from('activity_log')
          .select('id').eq('lead_id', lead.id).eq('type', 'priority_alert').eq('title', sig)
          .gte('created_at', since).limit(1)
        if (!recentAlert || recentAlert.length === 0) {
          const { sendHighPriorityAlert } = await import('@/lib/alerts')
          const content = buildAlertContent(sig, {
            leadName: lead.name || metadata.name, leadPhone: lead.phone,
            agentName: agent.name, lastMessage: messageText,
            botReply: sig === 'knowledge_gap' ? engineReply : null,
          })
          await sendHighPriorityAlert(agent, {
            subject: content.subject, html: content.html,
            whatsappText: content.whatsappText, templateValues: content.templateValues,
            msg91IntegratedNumber,
          })
          await supabaseAdmin.from('activity_log').insert({
            agent_id: agent.id, lead_id: lead.id, type: 'priority_alert',
            title: sig, description: SIGNAL_LABELS[sig],
          })
          log('priority_alert_sent', { signal: sig })
        }
      }
    } catch (alertErr: any) {
      logError('priority_alert_failed', { error: alertErr?.message })
    }

    // ── 3b. Bot-fallback escalation (the card was shown → bot couldn't answer) ──
    // For US (superadmins) to investigate + train the bot. Records a /admin event
    // (read by the superadmin panel — item 3c) with the last 2-3 messages + a
    // short AI "what likely went wrong" summary, and emails the superadmin desk.
    // Agent notification: knowledge_gap already alerts the agent via the priority
    // alert above (email + WhatsApp template); engine-down also emails the agent.
    // All best-effort — never blocks the customer reply.
    if (fallbackReason) {
      try {
        const { data: recent } = await supabaseAdmin.from('messages')
          .select('direction, content, created_at').eq('lead_id', lead.id)
          .order('created_at', { ascending: false }).limit(3)
        const lastMessages = (recent || []).reverse().map((m: any) => ({
          from: m.direction === 'inbound' ? 'customer' : 'bot', text: (m.content || '').slice(0, 300),
        }))

        // Short AI summary of the likely cause (best-effort; falls back to a default).
        let aiSummary = ''
        try {
          const convo = lastMessages.map(m => `${m.from}: ${m.text}`).join('\n')
          aiSummary = (await callLLM(
            [
              { role: 'system', content: 'You are a QA assistant for a real-estate WhatsApp bot. In ONE short sentence, state the most likely reason the bot could not answer, so the team can fix/train it. Be specific and practical.' },
              { role: 'user', content: `Reason flag: ${fallbackReason}\n\nConversation:\n${convo}\n\nCustomer's last message: ${messageText}` },
            ],
            { maxTokens: 80, deadlineMs: 12000 },
          )).slice(0, 300)
        } catch {
          aiSummary = fallbackReason === 'engine_down'
            ? 'AI engine was unavailable (both providers failed).'
            : "Bot had no confident answer for the customer's question."
        }

        await supabaseAdmin.from('activity_log').insert({
          agent_id: agent.id, lead_id: lead.id, type: 'bot_fallback',
          title: fallbackReason === 'engine_down' ? 'Bot fallback: engine down' : 'Bot fallback: could not answer',
          description: messageText.slice(0, 140),
          metadata: { reason: fallbackReason, question: messageText.slice(0, 500), botReply: engineReply.slice(0, 500), lastMessages, aiSummary },
        })

        const { sendEmail } = await import('@/lib/email')
        const esc = (s: string) => String(s || '').replace(/[<>]/g, '')
        const convoHtml = lastMessages.map(m => `<p style="margin:2px 0"><strong>${m.from}:</strong> ${esc(m.text)}</p>`).join('')
        // Superadmin desk — always.
        await sendEmail({
          to: 'support@convorian.in',
          subject: `🤖 Bot fallback (${fallbackReason}) — ${esc(agent.agency_name || agent.name || agent.id)}`,
          html: `<p><strong>Agency:</strong> ${esc(agent.agency_name || agent.name || agent.id)}</p>`
            + `<p><strong>Reason:</strong> ${fallbackReason}</p>`
            + `<p><strong>Likely cause:</strong> ${esc(aiSummary)}</p>`
            + `<p><strong>Last messages:</strong></p>${convoHtml}`
            + `<p style="color:#888;font-size:12px">Lead ${lead.id} · agent ${agent.id}</p>`,
        }).catch(() => {})
        // Agent email for engine-down (knowledge_gap already emailed the agent above).
        if (fallbackReason === 'engine_down' && agent.email) {
          await sendEmail({
            to: agent.email,
            subject: `Action needed: your AI assistant had a tech issue on a lead`,
            html: `<p>Hi ${esc(agent.name || '')},</p><p>Your Convorian assistant hit a brief technical issue and couldn't reply to <strong>${esc(lead.name || lead.phone)}</strong>. We've shared your contact card with them — please reach out directly so the lead isn't lost.</p>`,
          }).catch(() => {})
        }

        // Agent WhatsApp handoff via the approved `agent_bot_handoff` template.
        // Sent from the AGENT's own MSG91 number → billed to the AGENT (their lead,
        // their work). Numbered template vars in order: agent_name, customer_name,
        // customer_phone, question. Credits-gated; best-effort.
        try {
          const HANDOFF_TEMPLATE = process.env.MSG91_AGENT_HANDOFF_TEMPLATE || 'agent_bot_handoff'
          const agentPhone = String(agent.phone || '').replace(/\D/g, '')
          const HANDOFF_COST = Number(process.env.MSG91_TEMPLATE_COST || '1')
          if (agent.msg91_integrated_number && agentPhone && Number(agent.wa_balance || 0) >= HANDOFF_COST) {
            const vals = [
              (agent.name || 'there').trim().split(/\s+/)[0] || 'there',
              lead.name || 'a lead',
              lead.phone || '',
              messageText.slice(0, 160),
            ]
            const rid = await sendViaMsg91Template(agent.msg91_integrated_number, agentPhone, HANDOFF_TEMPLATE, vals, 'en')
            if (rid) await deductWABalance(agent.id, HANDOFF_COST, `Agent handoff alert — ${lead.name || lead.phone}`, HANDOFF_TEMPLATE, lead.id)
          }
        } catch (hErr: any) { logError('agent_handoff_whatsapp_failed', { error: hErr?.message }) }

        log('bot_fallback_escalated', { reason: fallbackReason })
      } catch (escErr: any) {
        logError('bot_fallback_escalation_failed', { error: escErr?.message })
      }
    }

    log('webhook_done', { durationMs: Date.now() - tStart })
    return NextResponse.json({ status: 'ok' })

  } catch (err: any) {
    logError('webhook_uncaught_error', { error: err.message, stack: err.stack })
    Sentry.captureException(err, { tags: { traceId } })
    return NextResponse.json({ status: 'error', message: err.message, traceId }, { status: 500 })
  }
}
