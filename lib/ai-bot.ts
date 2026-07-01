// lib/ai-bot.ts
// AI-first bot engine. Every message → AI understands → code acts → AI formats reply.
// AI NEVER types a property fact. All prices, sizes, locations come from the database.
//
// Phase 1 refactor: the pure pieces (types, prompt, tutorial, emails, booking)
// have been extracted into lib/bot/*. This file is now the thin orchestrator.

import { supabaseAdmin } from './supabase'
import { callLLM } from './llm'
import { searchPropertiesByFallbackChain } from './propertySearch'
import { buildPropertyBlock } from './propertyPresenter'
import { waSendText, waSendMedia, type WaChannel } from './whatsapp'
import { checkAbuseGuards } from './botGuards'
import { isConfirmationReply } from './appointmentConfirmation'
import { resolveAppointmentTime } from './appointment'
import { detectStage } from './stageMachine'
import { excludeSampleProperties } from './propertyVisibility'
import { buildPropertyRagContext } from './propertyRag'
import { translateText, needsTranslation, detectIndianScript } from './translate'
import {
  formatIST,
  bookingTimeIssue,
  isValidEmail,
  detectLanguageSwitchRequest,
} from './timeParser'

// Extracted modules (Phase 1 refactor)
import type { BotStage, ChatEntry, AIDecision, BotAction } from './bot/types'
import { MAX_HISTORY, MAX_PHOTOS } from './bot/types'
import { buildSystemPrompt, parseAIDecision } from './bot/prompt'
import { getTutorialDecision, tutorialStageForMessage } from './bot/tutorial'
import {
  sendCustomerConfirmation,
  sendAgentNotification,
  emailSuperadmin,
  notifyAgentOfTrollHalt,
} from './bot/emails'
import { createAppointment, executeBookingAction, type BookingContext } from './bot/booking'

// Re-export BotStage for backward compatibility (other files import it from here)
export type { BotStage } from './bot/types'

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function handleAiBotMessage(opts: {
  phone: string
  message: string
  agentId: string
  channel: WaChannel   // how to reply — Meta Cloud API direct
  simulate?: boolean   // onboarding simulation: run the real bot but DON'T send
                       // real WhatsApp messages (replies are still saved to the inbox)
  tutorialMode?: boolean
}): Promise<void> {
  const { phone, message, agentId, channel, simulate, tutorialMode } = opts

  // 1. Load agent
  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('id, name, agency_name, phone, email, office_open, office_close, weekly_off')
    .eq('id', agentId)
    .single()

  if (!agent) {
    console.error('[ai-bot] agent not found:', agentId)
    return
  }

  // 2. Load or create lead
  let { data: leadRaw } = await supabaseAdmin
    .from('leads')
    .select('*')
    .eq('agent_id', agentId)
    .eq('phone', phone)
    .maybeSingle()

  if (!leadRaw) {
    const { data: newLead, error } = await supabaseAdmin
      .from('leads')
      .insert({
        agent_id: agentId,
        phone,
        bot_stage: 'greeting',
        chat_history: [],
        language: 'en',
        source: 'whatsapp_inbound',
        last_message_at: new Date().toISOString(),
        window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single()

    if (error || !newLead) {
      console.error('[ai-bot] could not create lead:', error)
      return
    }
    leadRaw = newLead
  }

  // Cast to any for flexible access — these columns were added in migration 07
  const lead = leadRaw as any

  // Manual mode must silence the bot — unless we're in simulate (onboarding test),
  // where we always reply so the agent can see the bot working.
  if (lead.bot_paused && !simulate) {
    console.log(`[ai-bot] bot paused for ${phone}; skipping reply`)
    return
  }

  // 3. Add incoming message to chat history
  const history: ChatEntry[] = Array.isArray(lead.chat_history) ? lead.chat_history : []
  history.push({ role: 'user', text: message, ts: new Date().toISOString() })
  // Honor an explicit language-switch request ("english please", "hindi me bolo")
  // before the prompt is built, so the bot actually switches instead of refusing.
  // Explicit request ("english please") OR the lead writing in an Indian script
  // (Tamil/Telugu/Bengali…) sets the chat language deterministically.
  const forcedLang = detectLanguageSwitchRequest(message) || detectIndianScript(message)
  if (forcedLang && forcedLang !== lead.language) lead.language = forcedLang
  const messageCount = history.filter(entry => entry.role === 'user').length
  const tutorialOpeningFlow = !!tutorialMode && !!lead.is_sample && messageCount <= 2
  const leadForFlow = tutorialOpeningFlow
    ? { ...lead, name: null, language: null }
    : lead

  // 3b. TROLL KIT — run abuse guards BEFORE any LLM call so spam/junk costs
  //     nothing. If a guard trips, send its fixed reply and stop here.
  const guard = await checkAbuseGuards(lead.id, message, history)
  if (guard.halt) {
    console.log(`[ai-bot] abuse guard tripped for ${phone}: ${guard.reason}`)
    const guardReply = guard.reply || "Our team will reach out to help you shortly. 🙏"
    const guardOut = await waSendText(channel, phone, guardReply)
    if (guard.notifyAgent) await notifyAgentOfTrollHalt(agent, lead, phone, guard.reason || 'abuse guard')

    history.push({ role: 'bot', text: guardReply, ts: new Date().toISOString() })
    await supabaseAdmin.from('leads').update({
      last_message_at: new Date().toISOString(),
      chat_history: history.slice(-MAX_HISTORY),
    }).eq('id', lead.id)
    // The webhook already saved the inbound row — only record the bot's reply.
    await supabaseAdmin.from('messages').insert([
      { lead_id: lead.id, agent_id: agentId, direction: 'outbound', content: guardReply, sent_by: 'bot',
        wa_message_id: guardOut?.id || null, status: guardOut?.id ? 'sent' : 'failed' },
    ])
    return
  }

  // 4. Build conversation text for AI
  const conversationText = history
    .slice(-MAX_HISTORY)
    .map(e => `${e.role === 'user' ? 'Customer' : 'Bot'}: ${e.text}`)
    .join('\n')

  // Check if appointment already exists for this lead
  const { data: existingAppointment } = await supabaseAdmin
    .from('appointments')
    .select('id, scheduled_at, status, property_id')
    .eq('lead_id', lead.id)
    .eq('status', 'upcoming')
    .maybeSingle()

  const { data: propertiesRaw } = await supabaseAdmin
    .from('properties')
    .select('*')
    .eq('agent_id', agentId)
    .eq('status', 'active')

  const activeProperties = simulate
    ? ((propertiesRaw || []) as any[])
    : excludeSampleProperties((propertiesRaw || []) as any[])
  const ragCriteria = {
    intent: (lead.intent || null) as 'buy' | 'rent' | null,
    preferred_areas: Array.isArray(lead.preferred_areas) ? lead.preferred_areas : [],
    budget_max: lead.budget_max || null,
  }
  const propertyRag = buildPropertyRagContext(activeProperties, ragCriteria, {
    agentName: agent.name,
    agencyName: agent.agency_name,
    limit: 5,
  })

  const currentStage = detectStage(leadForFlow, messageCount)

  // Deterministic confirmation for existing appointments. This covers short
  // replies like "Confirm", "Yes", or "Acknowledged" even if the LLM misses it.
  if ((existingAppointment || lead.pending_appointment_time) && isConfirmationReply(message)) {
    const confirmedAt = new Date().toISOString()
    const confirmedTime = existingAppointment?.scheduled_at || lead.pending_appointment_time
    const confirmReply = `Perfect - your site visit is confirmed for ${formatIST(confirmedTime)}. See you then!`
    const confirmOut = simulate ? { id: null } : await waSendText(channel, phone, confirmReply)

    await supabaseAdmin.from('leads').update({
      last_message_at: confirmedAt,
      last_inbound_at: confirmedAt,
      last_outbound_at: confirmedAt,
      status: 'visit_booked',
      bot_stage: 'visit_confirmed',
      nurture_state: 'paused',
      window_nudge_count: 0,
      last_nudge_at: null,
      nurture_plan: null,
      plan_d_touches: 0,
      pending_appointment_time: null,
      pending_appointment_set_at: null,
      confirmation_followup_sent_at: null,
      chat_history: [
        ...history,
        { role: 'bot', text: confirmReply, ts: confirmedAt },
      ].slice(-MAX_HISTORY),
    }).eq('id', lead.id)

    await supabaseAdmin.from('messages').insert({
      lead_id: lead.id,
      agent_id: agentId,
      direction: 'outbound',
      content: confirmReply,
      sent_by: 'bot',
      wa_message_id: confirmOut?.id || null,
      status: (simulate || confirmOut?.id) ? 'sent' : 'failed',
    })

    console.log(`[ai-bot] existing visit confirmed by ${phone}`)
    return
  }

  // 5. First AI call — understand and decide
  let decision: AIDecision | null = null
  if (tutorialMode && lead.is_sample) {
    const tutorialDecision = getTutorialDecision(messageCount, message, agent, lead)
    if (tutorialDecision) {
      decision = {
        stage: tutorialStageForMessage(messageCount),
        reply: tutorialDecision.reply,
        action: tutorialDecision.action || null,
        updates: tutorialDecision.updates || {},
      }
    }
  }
  if (!decision) {
    try {
      const raw = await callLLM([
        { role: 'system', content: buildSystemPrompt(agent, leadForFlow, existingAppointment, activeProperties, history.slice(-8), propertyRag) },
        { role: 'user', content: `Conversation:\n${conversationText}\n\nRespond with JSON only.` },
      ], { maxTokens: 600, temperature: 0.35 })

      decision = parseAIDecision<AIDecision>(raw)
    } catch (err) {
      console.error('[ai-bot] LLM error (first call):', err)
    }
  }

  if (!decision) {
    await waSendText(channel, phone, "I'm having a small issue — please try again in a moment. 🙏")
    return
  }

  let finalReply = decision.reply
  let searchReply: string | null = null  // second message sent after "let me check"
  const photosToSend: string[] = []
  let resolvedMatchedPropertyId: string | null = lead.matched_property_id || null

  // 6. Execute action
  if (decision.action === 'search_properties') {
    const intent = decision.updates?.intent || lead.intent
    const areas = decision.updates?.preferred_areas || lead.preferred_areas || []
    const budgetMax = decision.updates?.budget_max || lead.budget_max || null

    const result = searchPropertiesByFallbackChain(activeProperties, {
      intent: intent as 'rent' | 'buy',
      preferred_areas: areas,
      budget_max: budgetMax,
    })

    // Prefer the customer's bedroom (BHK) preference, but only if it still
    // leaves at least one match — otherwise show what we have rather than nothing.
    const wantBhk = (decision.updates?.bhk || lead.bhk || '').toLowerCase().replace(/\s+/g, '')
    if (wantBhk) {
      const bhkMatches = result.properties.filter(
        (p: any) => (p.bhk || '').toLowerCase().replace(/\s+/g, '') === wantBhk
      )
      if (bhkMatches.length > 0) result.properties = bhkMatches
    }

    if (result.properties.length === 0) {
      const areaText = areas.join(', ') || 'that area'
      const intentLabel = intent === 'rent' ? 'rental' : 'sale'

      // Use the search result level to give a better response than a flat "no match".
      switch (result.level) {
        case 'no_inventory':
          searchReply = `I don't have any ${intentLabel} properties listed at the moment. Would you like me to have our team reach out to help find options for you? 😊`
          break
        case 'nearby': {
          const nearbyAreas = result.nearbyAreas || []
          const nearbyText = nearbyAreas.length > 0
            ? `I don't have exact matches in ${areaText}, but I found some great options in nearby areas like ${nearbyAreas.slice(0, 3).join(', ')}. Would you like to see those?`
            : `I don't have exact matches in ${areaText}, but there are properties nearby. Would you like to explore other areas?`
          searchReply = `${nearbyText} 😊`
          break
        }
        case 'area_no_budget':
          searchReply = `I found ${intentLabel} properties in ${areaText}, but they're above your budget range. Would you like to see them anyway, or shall I adjust the search? 😊`
          break
        default:
          searchReply = `I looked through all our ${intentLabel} properties in ${areaText} but don't have a match right now. 😔\n\nTo serve you better, shall I schedule a call with our team? They may have options that aren't listed yet.`
      }
    } else {
      // Build the property message ENTIRELY in code — every price/size/spec is
      // copied straight from the database. The AI is never allowed to type a
      // property fact (that's how invented prices happen). This is also what
      // fixed the malformed-listing bug.
      const blocks = result.properties
        .slice(0, 3)
        .map(p => buildPropertyBlock(p))
        .join('\n\n─────────────\n\n')
      searchReply = `Here are the top matches for you:\n\n${blocks}\n\nWhich one interests you? I can share photos or arrange a site visit. 😊`

      // Track matched property
      await supabaseAdmin
        .from('leads')
        .update({ matched_property_id: result.properties[0].id })
        .eq('id', lead.id)
      resolvedMatchedPropertyId = result.properties[0].id
    }
  }

  if (decision.action === 'send_photos') {
    const propertyId = resolvedMatchedPropertyId
    if (propertyId) {
      const { data: prop } = await supabaseAdmin
        .from('properties')
        .select('photos, property_media, video_url, brochure_url, title, is_sample')
        .eq('id', propertyId)
        .single()

      if (prop && !prop.is_sample) {
        // Dedupe: photos[] and property_media[] usually mirror each other, so
        // concatenating them sent every image TWICE. Set() keeps one of each.
        const urls = Array.from(new Set([
          ...(prop.photos || []),
          ...(prop.property_media || []),
        ])).filter((u: string) => typeof u === 'string' && u.startsWith('http'))

        photosToSend.push(...urls.slice(0, MAX_PHOTOS))
      }
    }

    if (photosToSend.length === 0) {
      finalReply = "Photos haven't been uploaded for this property yet. I'll let the agent know to add them! Meanwhile, would you like to schedule a site visit? 😊"
    }
  }

  if (decision.action === 'share_contact' || decision.action === 'handover') {
    const card =
      `👤 *${agent.name}*\n` +
      `📞 ${agent.phone || 'Contact via this chat'}\n` +
      (agent.email ? `📧 ${agent.email}\n` : '') +
      `🕐 Available: ${agent.office_open || '9:00 AM'} – ${agent.office_close || '7:00 PM'}`

    finalReply = `${finalReply}\n\n${card}`

    // Alert agent
    const agentPhone = (agent.phone || '').replace(/\D/g, '')
    if (agentPhone) {
      const leadName = lead.name || phone
      await waSendText(channel,
        agentPhone,
        `🔔 *Lead wants to speak to you*\n\n👤 ${leadName}\n📞 ${phone}\n\nPlease call them.`
      )
    }
  }

  // 7. Build the updates we'll save for this lead
  const leadUpdates: Record<string, any> = {
    last_message_at: new Date().toISOString(),
    bot_stage: decision.stage || currentStage,
    window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }

  if (decision.updates?.name) leadUpdates.name = decision.updates.name
  if (decision.updates?.language) leadUpdates.language = decision.updates.language
  // An explicit switch request always wins + persists (don't let the LLM revert it).
  if (forcedLang) leadUpdates.language = forcedLang
  if (decision.updates?.intent) leadUpdates.intent = decision.updates.intent
  if (decision.updates?.preferred_areas?.length) leadUpdates.preferred_areas = decision.updates.preferred_areas
  if (decision.updates?.budget_max) leadUpdates.budget_max = decision.updates.budget_max
  if (decision.updates?.bhk) leadUpdates.bhk = decision.updates.bhk
  if (decision.updates?.sqft_preference) leadUpdates.sqft_preference = decision.updates.sqft_preference
  const proposedEmail = decision.updates?.email?.trim()
  const emailIsValid = !proposedEmail || isValidEmail(proposedEmail)
  if (proposedEmail && emailIsValid) leadUpdates.email = proposedEmail

  const bookingResolution = resolveAppointmentTime({
    llmTime: decision.updates?.visit_time,
    replyText: message,
    nowMs: Date.now(),
  })
  if (bookingResolution.ok) {
    leadUpdates.pending_appointment_time = bookingResolution.iso
    leadUpdates.pending_appointment_set_at = new Date().toISOString()
    leadUpdates.confirmation_followup_sent_at = null
  }

  // ── Nurture signals + silent profile (the data moat) ───────────────────────
  const nowMs = Date.now()
  const prevOutMs = lead.last_outbound_at ? new Date(lead.last_outbound_at).getTime() : null
  const responseSecs = prevOutMs ? Math.max(0, Math.round((nowMs - prevOutMs) / 1000)) : null
  const replyWords = (message || '').trim().split(/\s+/).filter(Boolean).length
  const eng: Record<string, any> = { ...(lead.engagement || {}) }
  eng.replies = (eng.replies || 0) + 1
  eng.last_reply_words = replyWords
  if (responseSecs != null) {
    eng.last_response_secs = responseSecs
    eng.avg_response_secs = eng.avg_response_secs
      ? Math.round((eng.avg_response_secs * (eng.replies - 1) + responseSecs) / eng.replies)
      : responseSecs
  }
  leadUpdates.engagement = eng
  leadUpdates.last_inbound_at = new Date(nowMs).toISOString()
  leadUpdates.last_outbound_at = new Date(nowMs).toISOString() // we reply this turn
  // Inbound = the lead is talking to us → mark consented (new field; does NOT touch
  // nurture_state, which the existing A/B/C/D flow in lib/nurtureFlow.ts owns).
  if (!lead.consent_tier) leadUpdates.consent_tier = 'consented'
  // A reply restarts the nurture clock — reopen the 24h window (last_message_at
  // above) and reset the A/B/C/D flow (lib/nurtureFlow.ts) so it naturally
  // re-starts in-window on our next turn. The old webhook did this; the ai-bot
  // rewrite had dropped it, silently breaking the nurture timeline.
  leadUpdates.window_nudge_count = 0
  leadUpdates.last_nudge_at = null
  leadUpdates.nurture_plan = null
  leadUpdates.plan_d_touches = 0
  // Merge the silently-inferred traits into the hidden personality profile.
  if (decision.personality_cues && typeof decision.personality_cues === 'object') {
    leadUpdates.personality = { ...(lead.personality || {}), ...decision.personality_cues }
  }

  // The time the customer gave THIS turn (already parsed to IST), if any.
  const newTime: string | undefined = leadUpdates.pending_appointment_time

  // Auto-trigger the right booking action even if the AI forgets to set one.
  if (!decision.action) {
    if (existingAppointment && newTime) {
      decision.action = 'reschedule_visit'        // gave a new time while a visit exists
    } else if (leadUpdates.email && newTime && emailIsValid) {
      decision.action = 'book_visit'              // first-time booking
    }
  }
  // Giving a new time while a visit already exists is always a reschedule,
  // never a second booking.
  if (decision.action === 'book_visit' && existingAppointment && newTime) {
    decision.action = 'reschedule_visit'
  }
  // Nothing to reschedule → treat as a fresh booking.
  if (decision.action === 'reschedule_visit' && !existingAppointment) {
    decision.action = 'book_visit'
  }
  if (proposedEmail && !emailIsValid) {
    decision.action = null
    finalReply = 'Please share a valid email address like name@example.com so I can confirm your visit.'
  }

  let bookingLeadState: any = null
  if (decision.action === 'book_visit' || decision.action === 'reschedule_visit') {
    const { data } = await supabaseAdmin
      .from('leads')
      .select('name, email, matched_property_id, pending_appointment_time')
      .eq('id', lead.id)
      .maybeSingle()
    bookingLeadState = data || null
  }

  if (tutorialMode && lead.is_sample && decision.action === 'book_visit' && !resolvedMatchedPropertyId && !bookingLeadState?.matched_property_id) {
    const { data: sampleProp } = await supabaseAdmin
      .from('properties')
      .select('id')
      .eq('agent_id', agentId)
      .eq('is_sample', true)
      .eq('status', 'active')
      .ilike('location', 'Wakad')
      .limit(1)
      .maybeSingle()
    if (sampleProp?.id) resolvedMatchedPropertyId = sampleProp.id
  }

  // 8. Booking actions — run BEFORE we reply, so the message matches reality.
  if (decision.action === 'book_visit' || decision.action === 'reschedule_visit' || decision.action === 'cancel_visit') {
    const bookingCtx: BookingContext = {
      agentId,
      lead,
      leadUpdates,
      bookingLeadState,
      phone,
      agent,
      existingAppointment,
      resolvedMatchedPropertyId,
      tutorialMode,
    }
    finalReply = await executeBookingAction(decision.action, bookingCtx, newTime)
  }

  // For property searches the code-built listing (searchReply) is the single
  // source of truth — NEVER send the AI's own reply alongside it, because the AI
  // tends to invent property names/prices ("Property A — ₹48 lakhs"). Replace
  // finalReply with the clean listing so only verified facts go out.
  if (searchReply) {
    finalReply = searchReply
    searchReply = null
  }

  // 9. Send reply (capture the Meta message id for delivery tracking).
  // In simulate mode we skip the real WhatsApp send entirely — the reply is still
  // saved below so it shows in the inbox, but nothing goes out over Meta.
  // Speak the lead's language: the bot reasoned + wrote in English; translate the
  // customer-facing text out (Marathi/Tamil/…). Best-effort — keeps English on failure.
  if (needsTranslation(lead.language)) {
    finalReply = await translateText(finalReply, lead.language, 'en')
    if (searchReply) searchReply = await translateText(searchReply, lead.language, 'en')
  }
  const finalOut = simulate ? { id: null } : await waSendText(channel, phone, finalReply)
  let searchOut: { id: string | null } | null = null
  if (searchReply) {
    searchOut = simulate ? { id: null } : await waSendText(channel, phone, searchReply)
  }

  // 10. Send photos (one by one) — skipped in simulation.
  if (!simulate) {
    for (const url of photosToSend) {
      await waSendMedia(channel, phone, url)
    }
  }

  // 11. Save updated history (now that finalReply reflects the real outcome)
  history.push({ role: 'bot', text: finalReply, ts: new Date().toISOString() })
  if (searchReply) history.push({ role: 'bot', text: searchReply, ts: new Date().toISOString() })
  leadUpdates.chat_history = history.slice(-MAX_HISTORY)

  await supabaseAdmin.from('leads').update(leadUpdates).eq('id', lead.id)

  // 12. Log the bot's outbound replies. The webhook already saved the inbound
  // row (with its Meta wa_message_id), so we don't re-insert it here.
  const messageRows: any[] = [
    {
      lead_id: lead.id,
      agent_id: agentId,
      direction: 'outbound',
      content: finalReply,
      sent_by: 'bot',
      wa_message_id: finalOut?.id || null,
      status: (simulate || finalOut?.id) ? 'sent' : 'failed',
    },
  ]
  if (searchReply) {
    messageRows.push({
      lead_id: lead.id,
      agent_id: agentId,
      direction: 'outbound',
      content: searchReply,
      sent_by: 'bot',
      wa_message_id: searchOut?.id || null,
      status: (simulate || searchOut?.id) ? 'sent' : 'failed',
    })
  }
  await supabaseAdmin.from('messages').insert(messageRows)

  console.log(`[ai-bot] handled message from ${phone}, stage: ${decision.stage}, action: ${decision.action}`)
}