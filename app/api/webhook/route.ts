export const dynamic = "force-dynamic"
// Engine can take a GLM attempt (8s) + retry (20s) + DB work — without this Vercel
// kills the function mid-run and Meta/MSG91 retry the webhook, causing double replies.
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { generateBotReply } from '@/lib/gemini'
import { sendWhatsAppMessage, sendViaMsg91, sendViaMsg91Media, sendMetaImage } from '@/lib/whatsapp'
import { wantsPhotos, botPromisedPhotos, extractPropertyMedia, MAX_IMAGES_PER_SEND } from '@/lib/media'
import { shouldBotReply } from '@/lib/botGating'
import { resolveAppointmentTime, formatIST } from '@/lib/appointment'
import { detectInboundSignals, detectReplyKnowledgeGap, topSignal, SIGNAL_LABELS, type PrioritySignal } from '@/lib/intentSignals'
import { buildAlertContent, guardrailReply } from '@/lib/priorityAlerts'
import { verifySharedSecret } from '@/lib/webhookAuth'

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
  const tStart = Date.now()
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
        console.warn('⚠️  WEBHOOK AUTH BYPASS ACTIVE (SKIP_WEBHOOK_AUTH=true) — dev only')
      } else if (!secret) {
        console.error('WEBHOOK AUTH: MSG91_WEBHOOK_SECRET is not set — rejecting all requests')
        return NextResponse.json({ error: 'Webhook auth misconfigured' }, { status: 500 })
      } else if (!verifySharedSecret(request.headers.get('x-webhook-secret'), secret)) {
        console.warn('WEBHOOK AUTH: rejected — invalid or missing x-webhook-secret')
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const contentType = request.headers.get('content-type') || ''
    let fromPhone = '', messageText = '', waMessageId = '', phoneNumberId = '', forcedAgentId = ''
    let incomingProvider: 'meta' | 'twilio' | 'msg91' = PROVIDER === 'twilio' ? 'twilio' : 'meta'
    let msg91IntegratedNumber = ''

    if (PROVIDER === 'twilio' || contentType.includes('application/x-www-form-urlencoded')) {
      const text = await request.text()
      const params = new URLSearchParams(text)
      fromPhone = (params.get('From') || '').replace('whatsapp:', '').trim()
      // Normalize: always ensure + prefix for consistent DB matching
      if (fromPhone && !fromPhone.startsWith('+')) fromPhone = '+' + fromPhone
      messageText = params.get('Body') || ''
      waMessageId = params.get('MessageSid') || ''
      forcedAgentId = params.get('AgentId') || ''
      phoneNumberId = 'twilio'
      if (!messageText || !fromPhone) return new NextResponse('OK', { status: 200 })
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
          console.log('MSG91 inbound: could not extract text — FULL payload:', JSON.stringify(body))
          return NextResponse.json({ status: 'no_text' })
        }
        // Diagnostic: does this inbound carry a stable id (body.uuid)? The atomic
        // dedup that stops webhook-retry double-replies is keyed on wa_message_id
        // (=body.uuid). If button taps arrive with an EMPTY uuid, their retries
        // can't be deduped — this log tells us whether that gap is real before we
        // harden it. Safe to remove once confirmed.
        console.log(`MSG91 inbound: contentType=${body.contentType || '?'} uuid=${body.uuid ? 'present' : 'EMPTY'} textLen=${messageText.length}`)
      } else if (body.object === 'whatsapp_business_account') {
        // ── Meta Cloud API inbound ──
        const value = body.entry?.[0]?.changes?.[0]?.value
        if (!value?.messages?.length) return NextResponse.json({ status: 'no_messages' })
        const incomingMsg = value.messages[0]
        phoneNumberId = value.metadata?.phone_number_id || ''
        fromPhone = incomingMsg.from || ''
        messageText = incomingMsg.text?.body || ''
        waMessageId = incomingMsg.id || ''
        if (!messageText || !phoneNumberId) return NextResponse.json({ status: 'no_text' })
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
    } else if (PROVIDER === 'twilio') {
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
        console.log('Webhook Debug: bot gated —', gate.reason)
        return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: gate.reason })
      }
    }

    // Early dedup: Meta/MSG91 retry deliveries, so the same message can arrive
    // more than once. Cheap pre-check here; the authoritative guard is the
    // unique-index-protected insert below (atomic, race-proof).
    if (waMessageId) {
      const { data: existing } = await supabaseAdmin.from('messages').select('id').eq('wa_message_id', waMessageId).eq('direction', 'inbound').limit(1)
      if (existing && existing.length > 0) {
        return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: 'duplicate' })
      }
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
            console.error('Webhook: race-condition lead fetch failed', leadInsertError)
            return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: 'lead_create_failed' })
          }
          lead = raceLead
          // No activity_log for the race loser — the winner already logged it
        } else {
          console.error('Webhook: Failed to create lead', leadInsertError)
          return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: 'lead_create_failed' })
        }
      } else if (!newLead) {
        return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: 'lead_create_failed' })
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
    }

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
        else await sendWhatsAppMessage(agent.wa_phone_number_id, agent.wa_access_token, PROVIDER === 'twilio' ? `whatsapp:${fromPhone}` : fromPhone, bye)
      } catch { /* best-effort */ }
      return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: 'opted_out' })
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
        console.log('Webhook Debug: content-dedup hit (no uuid, same msg <60s ago) — skipping')
        return NextResponse.json({ status: 'duplicate' })
      }
    }
    const { error: inboundInsertError } = await supabaseAdmin.from('messages').insert({
      lead_id: lead.id, agent_id: agent.id, direction: 'inbound',
      content: messageText, wa_message_id: waMessageId || null, sent_by: 'lead'
    })
    if (inboundInsertError) {
      if (inboundInsertError.code === '23505') {
        console.log('Webhook Debug: duplicate inbound message (unique index), skipping')
        return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: 'duplicate' })
      }
      console.error('Webhook: Failed to record inbound message', inboundInsertError)
      // Don't reply if we couldn't record the message — a retry will reprocess it cleanly.
      return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: 'message_insert_failed' })
    }

    if (lead.bot_paused) {
      console.log('Webhook Debug: Lead is in manual mode (bot paused)')
      return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: 'manual_mode' })
    }

    // ── Safety guardrails: deflect NSFW / spam-scam / prompt-injection WITHOUT
    //    invoking the sales engine (saves an LLM call and keeps the bot in role).
    const inboundSignals = detectInboundSignals(messageText)
    if (inboundSignals.guardrail) {
      const safeReply = guardrailReply(inboundSignals.guardrail)
      console.log(`Webhook: guardrail tripped (${inboundSignals.guardrail}) — deflecting, engine skipped`)
      const { data: gOut } = await supabaseAdmin.from('messages').insert({
        lead_id: lead.id, agent_id: agent.id, direction: 'outbound', content: safeReply, sent_by: 'bot',
      }).select('id').single()
      try {
        let wid: string | null
        if (incomingProvider === 'msg91') wid = await sendViaMsg91(msg91IntegratedNumber, fromPhone, safeReply)
        else wid = await sendWhatsAppMessage(agent.wa_phone_number_id, agent.wa_access_token, PROVIDER === 'twilio' ? `whatsapp:${fromPhone}` : fromPhone, safeReply)
        if (wid && gOut?.id) await supabaseAdmin.from('messages').update({ wa_message_id: wid }).eq('id', gOut.id)
      } catch (e: any) { console.log('Guardrail send failed:', e?.message) }
      await supabaseAdmin.from('activity_log').insert({
        agent_id: agent.id, lead_id: lead.id, type: 'guardrail',
        title: `Guardrail: ${inboundSignals.guardrail}`, description: messageText.slice(0, 140),
      })
      await supabaseAdmin.from('agents').update({ messages_used: (agent.messages_used || 0) + 1 }).eq('id', agent.id)
      return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: 'guardrail', kind: inboundSignals.guardrail })
    }

    console.log(`Webhook Debug: Calling engine for lead ${lead.phone} with message: "${messageText}"`)
    const tEngine = Date.now()
    let reply: string, metadata: any
    try {
      const result = await generateBotReply(agent.id, lead.id, messageText)
      reply = result.reply
      metadata = result.metadata
    } catch (engineErr: any) {
      console.error('Webhook: engine error, using fallback reply', engineErr.message)
      reply = `Thank you for reaching out! Our team will get back to you shortly. 🙏`
      metadata = {}
    }
    console.log(`Webhook Timing: engine took ${Date.now() - tEngine}ms`)
    console.log(`Webhook Debug: Engine replied with: "${reply}" and metadata:`, metadata)

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

    // 1. Check for Cancellation
    if (metadata.appointment_status === 'cancelled' || /(cancel|drop|abort)[\s\S]*?(visit|appointment|viewing|meeting)/i.test(reply)) {
       console.log('APPT-DEBUG: Cancellation detected');
       leadUpdates.status = 'contacted'; // reset status
       
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
    } else {
      // Robustly resolve a real, IST-correct visit time (lib/appointment).
      // Replaces (a) the old chrono-only-when-the-model-omitted-it fallback and
      // (b) the now+24h fabrication that booked "tomorrow at the current time"
      // whenever the model's time was unparseable (the 6:58 PM bug). The resolver
      // tries the model's structured time, then natural language in the model
      // field, then the reply text the lead actually saw — and NEVER guesses.
      const bookingIntentRe = /(confirm|lock in|schedule|set|book|confirmed|updat|reschedul|chang|perfect|done|pakka|great|sounds good|works)[\s\S]*?(visit|appointment|viewing|tomorrow|today|at\s+\d+|on\s+\d+|sunday|monday|tuesday|wednesday|thursday|friday|saturday|\d+\s*(am|pm))/i
      const inboundVisitRe = /(visit|site visit|dekhna|aana|aata|come|tomorrow|kal)\s.*(at\s+\d+|\d+\s*(am|pm)|baje|subah|sham|dopahar)/i
      const apptIntent = !!metadata.appointment_booked_time || bookingIntentRe.test(reply) || (inboundVisitRe.test(messageText) && bookingIntentRe.test(reply))
      if (apptIntent) {
        const resolved = resolveAppointmentTime({
          llmTime: metadata.appointment_booked_time,
          replyText: reply + ' ' + messageText,
          nowMs: Date.now(),
        })
        if (resolved.ok) {
          metadata.appointment_booked_time = resolved.iso
          console.log(`APPT: resolved ${resolved.iso} (IST ${formatIST(resolved.iso)}) via ${resolved.source}`)
        } else {
          // No trustworthy time — NEVER fabricate one. If the reply implied a
          // booking, ask the lead to confirm the exact day/time instead.
          console.log('APPT: no trustworthy time —', resolved.reason)
          if (bookingIntentRe.test(reply)) {
            reply = "Happy to set that up! Could you confirm the exact day and time that works for your visit? For example: “tomorrow at 11:30 AM” or “Saturday at 5 PM”."
          }
          metadata.appointment_booked_time = null
        }
      }

      console.log(`APPT-DEBUG: metadata.appointment_booked_time=${metadata.appointment_booked_time || 'NOT SET'} bookingIntentRe=${bookingIntentRe.test(reply)} inboundVisitRe=${inboundVisitRe.test(messageText)}`)

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
          console.log('APPT-DEBUG: Booked time outside office hours — refusing and correcting reply')
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

    const parsedDate = metadata.appointment_booked_time ? new Date(metadata.appointment_booked_time) : null
    if (parsedDate && !isNaN(parsedDate.getTime())) {
      leadUpdates.status = 'visit_booked'
      
      let safePropertyId = null;
      if (metadata.matched_property_id) {
          const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(metadata.matched_property_id);
          safePropertyId = isUUID ? metadata.matched_property_id : null;
      }

      // Check if there is already an upcoming appointment for this lead
      const { data: existingAppts } = await supabaseAdmin
        .from('appointments')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('status', 'upcoming')
        .limit(1)

      let apptData, apptError;
      
      if (existingAppts && existingAppts.length > 0) {
        // Troll detection: Check how many times they have rescheduled
        const { count: rescheduleCount } = await supabaseAdmin
          .from('activity_log')
          .select('*', { count: 'exact', head: true })
          .eq('lead_id', lead.id)
          .eq('title', 'Site visit rescheduled by AI')

        if (rescheduleCount !== null && rescheduleCount >= 3) {
          // Reschedule limit reached: block this time change and bring in a
          // human — but KEEP THE BOT ON. Pausing here left leads talking to a
          // wall (no replies at all) while the agent never noticed the silent
          // activity-log entry. Now: bot keeps answering, agent gets an email.
          console.log('APPT-DEBUG: Reschedule limit (>=3). Blocking change, alerting agent, bot stays on.')
          reply = "Noted! Since we've moved this a few times, our team will personally call you to lock in the final time — that way it's settled in one go. Meanwhile, I'm right here for anything else you'd like to know. 😊"

          // Alert the agent ONCE per lead (email + activity log), not on every attempt.
          const { data: prevHandover } = await supabaseAdmin
            .from('activity_log').select('id')
            .eq('lead_id', lead.id).eq('type', 'human_handover').limit(1)
          if (!prevHandover || prevHandover.length === 0) {
            await supabaseAdmin.from('activity_log').insert({
              agent_id: agent.id, lead_id: lead.id, type: 'human_handover',
              title: 'Action needed: call this lead to fix the visit time',
              description: `${lead.name || lead.phone} has rescheduled 3+ times. The bot has stopped changing the appointment — please call them to confirm a final time.`
            })
            // High-priority → the trio (email + WhatsApp; call later). ROI-critical.
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
              console.error('Handover alert failed (non-critical):', alertErr?.message)
            }
          }

          // Skip updating the appointment time in DB
          metadata.appointment_booked_time = null
        } else {
          console.log('APPT-DEBUG: Found existing upcoming appointment, updating time to:', parsedDate.toISOString())
          const res = await supabaseAdmin.from('appointments').update({
            scheduled_at: parsedDate.toISOString(),
            property_id: safePropertyId || undefined // don't clear it if they just rescheduled
          }).eq('id', existingAppts[0].id).select()
          apptData = res.data
          apptError = res.error
        }
      } else {
        console.log('APPT-DEBUG: Inserting new appointment — agent_id:', agent.id, 'lead_id:', lead.id, 'property_id:', safePropertyId, 'scheduled_at:', parsedDate.toISOString())
        const res = await supabaseAdmin.from('appointments').insert({
          agent_id: agent.id,
          lead_id: lead.id,
          property_id: safePropertyId,
          scheduled_at: parsedDate.toISOString(),
          status: 'upcoming'
        }).select()
        apptData = res.data
        apptError = res.error
      }
      
      if (metadata.appointment_booked_time) {
        if (apptError) {
          console.error('APPT-DEBUG: SAVE FAILED:', apptError)
        } else {
          console.log('APPT-DEBUG: SAVE SUCCESS:', apptData)
        }
        
        await supabaseAdmin.from('activity_log').insert({
          agent_id: agent.id, lead_id: lead.id, type: 'visit_booked',
          title: existingAppts && existingAppts.length > 0 ? 'Site visit rescheduled by AI' : 'Site visit booked by AI',
          description: `Scheduled for ${formatIST(parsedDate.toISOString())} IST`
        })
      }
    } // end of Book/Reschedule Logic
    }

    await supabaseAdmin.from('leads').update(leadUpdates).eq('id', lead.id)

    // Save matched_property_id separately — column may not exist until migration runs;
    // a failure here must NOT break the main lead update above.
    if (safeMatchedPropId) {
      try {
        await supabaseAdmin.from('leads').update({ matched_property_id: safeMatchedPropId }).eq('id', lead.id)
      } catch { /* column may not exist yet — safe to ignore */ }
    }

    if (metadata.score) {
      await supabaseAdmin.from('activity_log').insert({
        agent_id: agent.id, lead_id: lead.id, type: 'score_updated',
        title: `Lead scored ${metadata.score}/10 — ${metadata.temperature || 'unknown'}`,
        description: `Intent: ${metadata.intent || '?'} | Budget: ${metadata.budget_min ? `₹${metadata.budget_min/100000}L` : '?'}`
      })
    }

    // Save bot reply to DB first — ensures simulation mode always shows the reply
    const { data: outboundMsg } = await supabaseAdmin.from('messages').insert({
      lead_id: lead.id, agent_id: agent.id, direction: 'outbound',
      content: reply, sent_by: 'bot'
    }).select('id').single()

    // Then attempt WhatsApp delivery (non-blocking — simulation works even if this fails)
    try {
      let outWaId: string | null
      if (incomingProvider === 'msg91') {
        outWaId = await sendViaMsg91(msg91IntegratedNumber, fromPhone, reply)
      } else {
        const toPhone = PROVIDER === 'twilio' ? `whatsapp:${fromPhone}` : fromPhone
        outWaId = await sendWhatsAppMessage(agent.wa_phone_number_id, agent.wa_access_token, toPhone, reply)
      }
      if (outWaId && outboundMsg?.id) {
        // Stamp the exact row we just inserted (order/limit are not valid on updates).
        await supabaseAdmin.from('messages')
          .update({ wa_message_id: outWaId })
          .eq('id', outboundMsg.id)
      }
      console.log(`Webhook Debug: WhatsApp sent. ID: ${outWaId}`)
    } catch (waErr: any) {
      console.log(`Webhook Debug: WhatsApp send failed (simulation mode OK): ${waErr.message}`)
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
        console.log('PHOTO: lead wants photos, looking up property...')
        const isUUID = (s: any) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
        let prop: any = null

        // 1. Try matched_property_id from current metadata or stored on lead
        const propId = metadata.matched_property_id || lead.matched_property_id
        if (isUUID(propId)) {
          const { data } = await supabaseAdmin.from('properties')
            .select('id,title,features').eq('id', propId).eq('agent_id', agent.id).maybeSingle()
          prop = data
          if (prop) console.log(`PHOTO: found via matched_property_id: ${prop.title}`)
        }

        // 2. Fallback: search recent bot messages for property title mentions
        if (!prop) {
          const { data: actives } = await supabaseAdmin.from('properties')
            .select('id,title,features').eq('agent_id', agent.id).eq('status', 'active').limit(20)
          const allProps = actives || []
          const withMedia = allProps.filter((p: any) => extractPropertyMedia(p).length)
          console.log(`PHOTO: no matched_property_id. Agent has ${allProps.length} properties, ${withMedia.length} with media`)

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
              console.log(`PHOTO: matched by title in recent messages: ${prop.title}`)
            } else if (titleMatches.length > 1) {
              prop = titleMatches[0]
              console.log(`PHOTO: multiple title matches (${titleMatches.length}), using most recent: ${prop.title}`)
            } else if (withMedia.length === 1) {
              prop = withMedia[0]
              console.log(`PHOTO: no title match, using only property with media: ${prop.title}`)
            } else {
              console.log(`PHOTO: could not determine which property — ${withMedia.length} have media, none matched recent conversation`)
            }
          }
        }

        const media = prop ? extractPropertyMedia(prop).slice(0, MAX_IMAGES_PER_SEND) : []
        if (media.length) {
          console.log(`PHOTO: sending ${media.length} photo(s) for "${prop.title}" (${prop.id})`)
          for (let i = 0; i < media.length; i++) {
            const caption = i === 0 ? (prop.title || 'Property') : undefined
            let mid: string | null = null
            if (incomingProvider === 'msg91') mid = await sendViaMsg91Media(msg91IntegratedNumber, fromPhone, media[i], caption)
            else mid = await sendMetaImage(agent.wa_phone_number_id, agent.wa_access_token, fromPhone, media[i], caption)
            console.log(`PHOTO: image ${i+1}/${media.length} send result: ${mid ? 'OK' : 'FAILED'}`)
            await supabaseAdmin.from('messages').insert({
              lead_id: lead.id, agent_id: agent.id, direction: 'outbound',
              content: `[photo] ${prop.title || ''}`.trim(), sent_by: 'bot',
              wa_message_id: typeof mid === 'string' ? mid : null,
            })
          }
        } else {
          console.log(`PHOTO: no photos to send — prop=${prop ? prop.title : 'none found'}, media count=${media.length}`)
        }
      }
    } catch (mediaErr: any) {
      console.error('Photo share failed (non-critical):', mediaErr?.message)
    }

    // ── High-priority alerts to the agent (email + WhatsApp) ──
    // ROI-critical moments: visit booked, lead arriving now, wants a call/human,
    // very interested, the bot hit a knowledge gap, or a competitor is probing.
    // Best-effort + deduped per (lead, signal) within 3h so we never spam.
    try {
      const priorities: PrioritySignal[] = [...inboundSignals.priorities]
      if (metadata.appointment_booked_time) priorities.push('visit_booked')
      if ((metadata.score || 0) >= 8 && !priorities.includes('very_interested')) priorities.push('very_interested')
      if (detectReplyKnowledgeGap(reply) && !priorities.includes('knowledge_gap')) priorities.push('knowledge_gap')

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
            botReply: sig === 'knowledge_gap' ? reply : null,
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
          console.log(`Webhook: priority alert sent — ${sig}`)
        }
      }
    } catch (alertErr: any) {
      console.error('Priority alert failed (non-critical):', alertErr?.message)
    }

    console.log(`Webhook Timing: total ${Date.now() - tStart}ms (lead ${lead.phone})`)
    return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: 'ok' })

  } catch (err: any) {
    console.error('Webhook error:', err)
    return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: 'error', message: err.message }, { status: 500 })
  }
}
