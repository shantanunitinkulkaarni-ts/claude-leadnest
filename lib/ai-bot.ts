// lib/ai-bot.ts
// AI-first bot engine. Every message → AI understands → code acts → AI formats reply.
// AI NEVER types a property fact. All prices, sizes, locations come from the database.
//
// Phase 1 refactor: the pure pieces (types, prompt, tutorial, emails, booking)
// have been extracted into lib/bot/*. This file is now the thin orchestrator.

import { supabaseAdmin } from './supabase'
import { callLLM } from './llm'
import { waSendText, type WaChannel } from './whatsapp'
import { checkAbuseGuards } from './botGuards'
import { isConfirmationReply, isPendingAppointmentExpired } from './appointmentConfirmation'
import { detectStage } from './stageMachine'
import { excludeSampleProperties } from './propertyVisibility'
import { buildPropertyRagContext } from './propertyRag'
import { buildAgentBookingRagMarkdown } from './bookingRag'
import { detectIndianScript } from './translate'
import {
  formatIST,
  detectLanguageSwitchRequest,
  isValidEmail,
} from './timeParser'

// Extracted modules (Phase 1 refactor)
import type { BotStage, AIDecision } from './bot/types'
import { MAX_HISTORY } from './bot/types'
import { buildSystemPrompt, parseAIDecision } from './bot/prompt'
import { getTutorialDecision, tutorialStageForMessage } from './bot/tutorial'
import {
  notifyAgentOfTrollHalt,
} from './bot/emails'
import { executeBookingAction, type BookingContext } from './bot/booking'
import {
  appendUserMessage,
  buildConversationText,
  loadOrCreateLead,
  outboundMessageRow,
  saveLeadHistory,
  saveOutboundMessages,
} from './bot/conversation'
import { handlePropertySearchAction } from './bot/propertySearchAction'
import { handlePhotoAction, sendPhotoUrls } from './bot/photos'
import { applyHandover } from './bot/handover'
import { prepareLeadUpdates } from './bot/leadUpdates'
import { cleanBookingAction } from './bot/actionCleanup'
import { prepareBookingSupport } from './bot/bookingSupport'
import { deliverReplies } from './bot/replyDelivery'
import { runConversationFlowStep } from './bot/flowRunner'
import {
  agentToFlowSettings,
  flowDecisionToAiDecision,
  historyToFlowRecent,
  leadToFlowLead,
  shouldUseConversationFlow,
} from './bot/flowDecisionAdapter'
import { buildPostPropertyDecision } from './bot/postPropertyDecision'
import { aiComposeReply } from './bot/aiDecoder'

// Re-export BotStage for backward compatibility (other files import it from here)
export type { BotStage } from './bot/types'

function isCancelIntent(message: string): boolean {
  const text = String(message || '').trim().toLowerCase()
  if (!text) return false
  return /(^|\b)(please\s+)?cancel(\s+it)?(\b|$)/i.test(text)
    || /\bnako\s+cancel\b/i.test(text)
    || /\btheek\s+hai[, ]*\s*cancel\b/i.test(text)
    || /\bcancel\s+my\s+visit\b/i.test(text)
}

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
    .select('id, name, agency_name, phone, email, office_open, office_close, weekly_off, holidays, plan, languages, property_types')
    .eq('id', agentId)
    .single()

  if (!agent) {
    console.error('[ai-bot] agent not found:', agentId)
    return
  }

  // 2. Load or create lead
  const lead = await loadOrCreateLead(agentId, phone)
  if (!lead) return
  // Manual mode must silence the bot — unless we're in simulate (onboarding test),
  // where we always reply so the agent can see the bot working.
  if (lead.bot_paused && !simulate) {
    console.log(`[ai-bot] bot paused for ${phone}; skipping reply`)
    return
  }

  // 3. Add incoming message to chat history
  const history = appendUserMessage(lead, message)
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
    await saveLeadHistory(lead.id, {
      last_message_at: new Date().toISOString(),
      chat_history: history.slice(-MAX_HISTORY),
    })
    // The webhook already saved the inbound row - only record the bot reply.
    await saveOutboundMessages([
      outboundMessageRow({
        leadId: lead.id,
        agentId,
        content: guardReply,
        waMessageId: guardOut?.id || null,
        sent: !!guardOut?.id,
      }),
    ])
    return
  }

  // 4. Build conversation text for AI
  const conversationText = buildConversationText(history)

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

  const allProperties = simulate
    ? ((propertiesRaw || []) as any[])
    : excludeSampleProperties((propertiesRaw || []) as any[])
  const activeProperties = allProperties.filter((p: any) => String(p?.status || 'active').toLowerCase() === 'active')
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
  const bookingRag = buildAgentBookingRagMarkdown(agent, allProperties, {
    agentName: agent.name,
    agencyName: agent.agency_name,
    selectedPropertyId: lead.matched_property_id || existingAppointment?.property_id || null,
    limit: 6,
  })

  const currentStage = detectStage(leadForFlow, messageCount)
  const hasFreshPendingAppointment = !!lead.pending_appointment_time && !isPendingAppointmentExpired(lead.pending_appointment_set_at)

  // Deterministic confirmation for existing appointments. This covers short
  // replies like "Confirm", "Yes", or "Acknowledged" even if the LLM misses it.
  if ((existingAppointment || hasFreshPendingAppointment) && isConfirmationReply(message)) {
    const confirmedAt = new Date().toISOString()
    if (existingAppointment) {
      const confirmedTime = existingAppointment.scheduled_at
      const confirmReply = `Perfect - your site visit is confirmed for ${formatIST(confirmedTime)}. See you then!`
      const confirmOut = simulate ? { id: null } : await waSendText(channel, phone, confirmReply)

      await saveLeadHistory(lead.id, {
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
        chat_history: [
          ...history,
          { role: 'bot', text: confirmReply, ts: confirmedAt },
        ].slice(-MAX_HISTORY),
      })

      await saveOutboundMessages([
        outboundMessageRow({
          leadId: lead.id,
          agentId,
          content: confirmReply,
          waMessageId: confirmOut?.id || null,
          sent: !!(simulate || confirmOut?.id),
        }),
      ])

      console.log(`[ai-bot] existing visit confirmed by ${phone}`)
      return
    }

    const bookingCtx: BookingContext = {
      agentId,
      lead,
      leadUpdates: { email: lead.email || undefined },
      bookingLeadState: lead,
      phone,
      agent,
      existingAppointment: null,
      resolvedMatchedPropertyId: lead.matched_property_id || null,
      tutorialMode,
    }
    const emailIsValid = isValidEmail(lead.email || '')
    const confirmReply = emailIsValid
      ? await executeBookingAction('book_visit', bookingCtx, undefined)
      : 'Please share your email address so I can send the visit confirmation.'
    const confirmOut = simulate ? { id: null } : await waSendText(channel, phone, confirmReply)

    await saveLeadHistory(lead.id, {
      last_message_at: confirmedAt,
      last_inbound_at: confirmedAt,
      last_outbound_at: confirmedAt,
      bot_stage: emailIsValid ? 'visit_confirmed' : 'awaiting_email',
      status: emailIsValid ? 'visit_booked' : (lead.status || 'new'),
      nurture_state: emailIsValid ? 'paused' : lead.nurture_state || 'active',
      window_nudge_count: 0,
      last_nudge_at: null,
      nurture_plan: null,
      plan_d_touches: 0,
      pending_appointment_time: emailIsValid ? null : lead.pending_appointment_time || null,
      pending_appointment_set_at: emailIsValid ? null : lead.pending_appointment_set_at || null,
      chat_history: [
        ...history,
        { role: 'bot', text: confirmReply, ts: confirmedAt },
      ].slice(-MAX_HISTORY),
    })

    await saveOutboundMessages([
      outboundMessageRow({
        leadId: lead.id,
        agentId,
        content: confirmReply,
        waMessageId: confirmOut?.id || null,
        sent: !!(simulate || confirmOut?.id),
      }),
    ])

    console.log(`[ai-bot] pending visit confirmation handled by ${phone}`)
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
      const flow = await runConversationFlowStep({
        agent: agentToFlowSettings(agent),
        lead: leadToFlowLead(leadForFlow),
        message,
        recent: historyToFlowRecent(history),
      })
      if (shouldUseConversationFlow({
        lead: leadForFlow,
        extractedMessageType: flow.extracted.message_type,
        existingAppointment,
      })) {
        decision = flowDecisionToAiDecision(flow.decision)
      } else if (leadForFlow.matched_property_id || leadForFlow.pending_appointment_time) {
        decision = buildPostPropertyDecision({
          decoded: flow.extracted,
          lead: leadForFlow,
        })
      }
    } catch (err) {
      console.error('[ai-bot] conversation flow error:', err)
    }
  }
  if (existingAppointment && isCancelIntent(message)) {
    decision = {
      stage: 'visit_confirmed',
      reply: 'Sure — I will cancel it now.',
      action: 'cancel_visit',
      updates: {},
    }
  }
  if (!decision) {
    try {
      const raw = await callLLM([
        { role: 'system', content: buildSystemPrompt(agent, leadForFlow, existingAppointment, activeProperties, history.slice(-8), propertyRag, bookingRag) },
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
    const outcome = await handlePropertySearchAction({
      activeProperties,
      decision,
      lead,
      leadId: lead.id,
    })
    searchReply = outcome.reply
    if (outcome.matchedPropertyId) resolvedMatchedPropertyId = outcome.matchedPropertyId
  }
  if (decision.action === 'send_photos') {
    const photoAction = await handlePhotoAction(resolvedMatchedPropertyId)
    photosToSend.push(...photoAction.photosToSend)
    if (photoAction.fallbackReply) finalReply = photoAction.fallbackReply
  }
  if (decision.action === 'share_contact' || decision.action === 'handover') {
    finalReply = await applyHandover({
      reply: finalReply,
      agent,
      lead,
      leadPhone: phone,
      channel,
    })
  }
  // 7. Build the updates we'll save for this lead
  const {
    leadUpdates,
    proposedEmail,
    emailIsValid,
    newTime,
  } = await prepareLeadUpdates({
    decision,
    lead,
    message,
    currentStage,
    forcedLang,
    bookingKnowledge: bookingRag,
  })
  finalReply = cleanBookingAction({
    decision,
    lead,
    leadUpdates,
    existingAppointment,
    newTime,
    proposedEmail,
    emailIsValid,
    finalReply,
  })
  const bookingSupport = await prepareBookingSupport({
    decision,
    agentId,
    lead,
    tutorialMode,
    resolvedMatchedPropertyId,
  })
  const bookingLeadState = bookingSupport.bookingLeadState
  resolvedMatchedPropertyId = bookingSupport.resolvedMatchedPropertyId
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

  // Rewrite finalReply to sound natural using aiComposeReply (AI encoder).
  // Takes the app's draft and makes it warm, human, and WhatsApp-friendly.
  // Never invents facts — only rewrites what's in the brief.
  if (finalReply) {
    try {
      finalReply = await aiComposeReply(finalReply, {
        language: lead.language,
        recent: historyToFlowRecent(history).slice(-6),
      })
    } catch (err) {
      console.error('[ai-bot] aiComposeReply failed:', err)
      // If aiComposeReply fails, keep the original finalReply and continue
    }
  }

  // 9. Send reply (capture the Meta message id for delivery tracking).
  // In simulate mode we skip the real WhatsApp send entirely — the reply is still
  // saved below so it shows in the inbox, but nothing goes out over Meta.
  if (process.env.TEST_MODE_LLM === 'true') {
    console.log('[TEST-REPLY] ' + (finalReply || '(empty)'))
  }

  const delivery = await deliverReplies({
    channel,
    phone,
    finalReply,
    searchReply,
    language: lead.language,
    simulate,
  })
  finalReply = delivery.finalReply
  searchReply = delivery.searchReply
  const finalOut = delivery.finalOut
  const searchOut = delivery.searchOut

  // 10. Send photos (one by one) - skipped in simulation.
  // Photo sending failures don't affect history - the reply was already sent.
  // We log failures for debugging but don't block history save.
  if (photosToSend.length > 0) {
    try {
      await sendPhotoUrls(channel, phone, photosToSend, simulate)
    } catch (err) {
      console.error('[ai-bot] photo sending failed:', err)
    }
  }

  // 11. Save updated history (now that finalReply reflects the real outcome)
  history.push({ role: 'bot', text: finalReply, ts: new Date().toISOString() })
  if (searchReply) history.push({ role: 'bot', text: searchReply, ts: new Date().toISOString() })
  leadUpdates.chat_history = history.slice(-MAX_HISTORY)

  await saveLeadHistory(lead.id, leadUpdates)

  // 12. Log the bot's outbound replies. The webhook already saved the inbound
  // row (with its Meta wa_message_id), so we don't re-insert it here.
  const messageRows: any[] = [
    outboundMessageRow({
      leadId: lead.id,
      agentId,
      content: finalReply,
      waMessageId: finalOut?.id || null,
      sent: !!(simulate || finalOut?.id),
    }),
  ]
  if (searchReply) {
    messageRows.push(outboundMessageRow({
      leadId: lead.id,
      agentId,
      content: searchReply,
      waMessageId: searchOut?.id || null,
      sent: !!(simulate || searchOut?.id),
    }))
  }
  await saveOutboundMessages(messageRows)

  console.log(`[ai-bot] handled message from ${phone}, stage: ${decision.stage}, action: ${decision.action}`)
}
