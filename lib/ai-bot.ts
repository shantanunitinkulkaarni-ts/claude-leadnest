// lib/ai-bot.ts
// AI-first bot engine. Every message → AI understands → code acts → AI formats reply.
// AI NEVER types a property fact. All prices, sizes, locations come from the database.

import { supabaseAdmin } from './supabase'
import { callLLM } from './llm'
import { searchPropertiesByFallbackChain } from './propertySearch'
import { buildPropertyBlock } from './propertyPresenter'
import { waSendText, waSendMedia, type WaChannel } from './whatsapp'
import { sendEmail } from './email'
import { checkAbuseGuards } from './botGuards'
import { isConfirmationReply } from './appointmentConfirmation'
import { resolveAppointmentTime } from './appointment'
import { detectStage } from './stageMachine'
import { excludeSampleProperties } from './propertyVisibility'
import { buildPropertyRagContext } from './propertyRag'
import { buildLeadMemoryContext } from './leadMemory'
import { translateText, needsTranslation, detectIndianScript } from './translate'
import {
  parseTimeString,
  formatIST,
  visitHourIST,
  parseHourLabel,
  humanizeTimeLabel,
  visitWeekdayIST,
  bookingTimeIssue,
  isValidEmail,
  detectLanguageSwitchRequest,
} from './timeParser'

// Send an email via Resend's REST API (lib/email.ts — no SDK dependency).
// IMPORTANT: do NOT use the `resend` npm package here — it is not installed,
// so require('resend') throws at runtime and silently drops every email.
async function sendEmailViaResend(to: string, subject: string, body: string, fallbackEmail?: string): Promise<void> {
  const html = body.replace(/\n/g, '<br>')
  const res = await sendEmail({ to, subject, html })
  if (!res.ok) {
    console.error(`[ai-bot] email to ${to} failed: ${res.error}`)
    if (fallbackEmail) {
      const alt = await sendEmail({ to: fallbackEmail, subject, html })
      console.log(`[ai-bot] fallback email to ${fallbackEmail}: ${alt.ok ? 'sent' : alt.error}`)
    }
  } else {
    console.log(`[ai-bot] email sent to ${to} (id: ${res.id})`)
  }
}

// Send confirmation email to customer
async function sendCustomerConfirmation(customerEmail: string, leadName: string, propertyTitle: string, visitTime: string): Promise<void> {
  const visitDate = new Date(visitTime).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
  const visitTimeStr = new Date(visitTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })

  const body = `Hi ${leadName},

Your site visit has been confirmed! ✅

📍 Property: ${propertyTitle}
📅 Date: ${visitDate}
🕐 Time: ${visitTimeStr} IST

Our team will reach out to you shortly with more details and directions.

Thank you for choosing us!

Best regards,
Convorian Team`

  await sendEmailViaResend(customerEmail, '✅ Your Site Visit is Confirmed', body)
}

// Send notification email to agent
async function sendAgentNotification(agentEmail: string, leadName: string, leadPhone: string, leadEmail: string, propertyTitle: string, visitTime: string): Promise<void> {
  const visitDate = new Date(visitTime).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
  const visitTimeStr = new Date(visitTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })

  const body = `New Site Visit Request

Lead: ${leadName}
Phone: ${leadPhone}
Email: ${leadEmail}

Property: ${propertyTitle}
Scheduled: ${visitDate} at ${visitTimeStr} IST

Please confirm if you can accommodate this visit.

---
This is an automated message from Convorian Bot`

  await sendEmailViaResend(agentEmail, '🔔 New Site Visit Request', body)
}

// Send error alert to superadmin
async function emailSuperadmin(subject: string, body: string): Promise<void> {
  const adminEmail = 'support@convorian.in'
  const fallbackEmail = 'convorian@gmail.com'
  await sendEmailViaResend(adminEmail, subject, body, fallbackEmail)
}

// Tell the agent a lead hit an abuse guard so a human can take over.
async function notifyAgentOfTrollHalt(agent: any, lead: any, phone: string, reason: string): Promise<void> {
  const leadName = lead?.name || phone
  if (agent?.email) {
    await sendEmailViaResend(
      agent.email,
      '🚦 Lead needs a human (auto-paused)',
      `The bot paused automatically for a lead and needs you to take over.\n\nLead: ${leadName}\nPhone: ${phone}\nReason: ${reason}\n\nPlease reach out to them directly.`
    )
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type BotStage =
  | 'greeting'
  | 'language'
  | 'name'
  | 'intent'
  | 'qualifying'
  | 'property_shown'
  | 'awaiting_visit_time'
  | 'awaiting_email'
  | 'visit_confirmed'
  | 'handover'

type ChatEntry = {
  role: 'user' | 'bot'
  text: string
  ts: string
}

type AIDecision = {
  stage: BotStage
  reply: string
  action: 'search_properties' | 'send_photos' | 'book_visit' | 'reschedule_visit' | 'cancel_visit' | 'share_contact' | 'handover' | null
  updates: {
    name?: string
    language?: string
    intent?: 'rent' | 'buy'
    preferred_areas?: string[]
    budget_max?: number
    bhk?: string
    sqft_preference?: number
    visit_time?: string
    email?: string
  }
  // SILENT sales profiling — inferred traits, NEVER shown to the customer.
  personality_cues?: Record<string, string | number | boolean>
}

type TutorialDecision = {
  reply: string
  updates?: Record<string, any>
  action?: AIDecision['action']
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_HISTORY = 12   // max chat entries to keep (6 exchanges)
const MAX_PHOTOS = 5

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(agent: any, lead: any, existingAppointment: any, properties?: any[], recentHistory: ChatEntry[] = [], propertyRag?: string): string {
  // Languages the LLM writes poorly (Marathi, Tamil, …) are WRITTEN in English and
  // translated on the way out (see translate.ts) — only en/hi/hinglish are native.
  const lang = lead.language || 'en'
  const writeLang = needsTranslation(lang) ? 'en' : lang
  const langLabel =
    writeLang === 'hi' ? 'Hindi' :
    writeLang === 'hinglish' ? 'Hinglish (Hindi written in English letters)' :
    'English'

  const agentName = agent.name || 'our team'
  const agencyName = agent.agency_name || 'our agency'
  const openTime = humanizeTimeLabel(agent.office_open || '09:00')
  const closeTime = humanizeTimeLabel(agent.office_close || '19:00')
  const weekOff = agent.weekly_off || null

  const leadContext = buildLeadMemoryContext(lead, existingAppointment ? {
    scheduled_at: formatIST(existingAppointment.scheduled_at),
    status: existingAppointment.status,
  } : null, recentHistory.slice(-8))

  const historyContext = recentHistory.length
    ? recentHistory.map((entry, idx) => `${idx + 1}. ${entry.role === 'user' ? 'Customer' : 'Bot'}: ${entry.text}`).join('\n')
    : 'No prior chat history available.'

  const propertiesBlock = properties && properties.length > 0
    ? `\nAVAILABLE PROPERTIES — copy facts exactly, do not invent:\n${
        properties.slice(0, 3).map((p, i) => `[${i + 1}] ${JSON.stringify({
          id: p.id,
          title: p.title,
          type: p.type,
          location: p.location,
          bhk: p.bhk,
          size_sqft: p.size_sqft,
          rent_per_month: p.rent_per_month,
          price: p.price,
          deposit: p.deposit,
          facing: p.facing,
          features: (p.features || []).slice(0, 6),
          description: p.description,
          extra_info: p.extra_info,
          possession_status: p.possession_status,
          possession_date: p.possession_date,
          floor_plan_available: p.floor_plan_available,
          booking_started: p.booking_started,
          finance_options: p.finance_options,
          area_ranking: p.area_ranking,
          purchase_indicator: p.purchase_indicator,
          parking_available: p.parking_available,
          parking_details: p.parking_details,
          broker_recommendation: p.broker_recommendation,
          has_photos: (p.photos || []).length > 0,
        })}`).join('\n')
      }`
    : ''
  const ragBlock = propertyRag ? `\nPROPERTY RAG SNAPSHOT:\n${propertyRag}\n` : ''

  // Today's date in IST — the AI MUST know this to resolve dates like "5th July"
  // or "next Monday" correctly (it can't compute weekdays without an anchor).
  const todayIST = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
  })
  const knownNameRule = lead.name
    ? `- The lead's name is already known as "${lead.name}". Use their name SPARINGLY — an occasional, natural touch at most. Do NOT open messages with "Hello ${lead.name}" or "${lead.name}," — repeating their name every message sounds robotic. DO NOT ask for their name again unless they explicitly correct it.`
    : `- The lead's name is not known yet. Ask for their name warmly early in the conversation.`
  const knownLanguageRule = lead.language
    ? `- The lead's language is already stored as ${langLabel}. Continue in that language and do NOT ask language preference again unless they ask to switch.`
    : `- If the lead's language is not known yet, ask whether they prefer English, Hindi, or Hinglish before moving deeper into qualification.`

  return `You are a WhatsApp property assistant for ${agentName} (${agencyName}).
Office hours: ${openTime} to ${closeTime}${weekOff ? `, closed on ${weekOff}s` : ''}.

TODAY (India time) is ${todayIST}. Resolve every date the user mentions relative
to this — "5th July", "tomorrow", "next Monday" — and ALWAYS put visit_time as a
full ISO date "YYYY-MM-DDTHH:MM" (e.g. 2026-07-05T13:00). Never guess the weekday;
compute it from today's date above.

LANGUAGE: Always reply in ${langLabel} only. Never switch unless the user explicitly asks.

STATE-FIRST FLOW:
${knownNameRule}
${knownLanguageRule}
- Continue from the highest known point in the funnel. Never restart from greeting/name/language if CURRENT LEAD STATE or CURRENT CHAT HISTORY already contains that information.

CONVERSATION FLOW (only ask for what is still unknown):
1. Greet warmly
2. If language is unknown → ask language preference (English / Hindi / Hinglish)
3. If name is unknown → ask their name
4. If intent is unknown → ask: looking to Rent or Buy?
5. If area is unknown → ask: which area?
6. If budget is unknown → ask: monthly budget? (for rent) or total budget? (for buy)
7. If bedrooms are unknown → ask: how many bedrooms? (1BHK / 2BHK / 3BHK etc.)
8. Once you have intent + area → set action to "search_properties"
9. Present matched properties using ONLY the data provided
10. Offer photos when presenting properties ("Would you like photos?")
11. When user wants to visit → ASK for preferred date and time (e.g. "tomorrow at 11 AM")
12. Once user gives time → ask for their email address for confirmation
13. Once user gives email → set action "book_visit" to create appointment
14. Confirm on WhatsApp with all details (property, time, contact)

RULES:
- NEVER invent prices, sizes, locations, AMENITIES, features, or any property fact.
  If an amenity/feature isn't in the provided data, do NOT mention it — never assume
  a property has a gym, pool, parking, clubhouse, etc. unless it's in the data.
- NEVER promise to send a brochure, PDF, floor plan, or anything by EMAIL. The only
  thing you can share is photos on WhatsApp (via the send_photos action). Never say
  "I'll email you" or "I'll send the brochure to your email".
- Area is non-negotiable — never suggest a different area unless the user agrees
- If user asks for photos → set action "send_photos"
- If user wants to speak to someone / asks for agent contact → set action "share_contact"
- If user is very upset or demands human → set action "handover"
- Stay on property topics; for off-topic questions say you specialize in property search
- Be warm, friendly, and concise — WhatsApp messages, not essays

BOOKING LOGIC (critical — must follow):
- CHECK FIRST: does the lead already have an upcoming appointment? See CURRENT LEAD DATA (existing_appointment).
- NO existing appointment:
  - When user wants to book → ask for date/time
  - When user gives date/time → ask for email
  - When you have BOTH date/time AND email → set action "book_visit"
- HAS an existing appointment:
  - If user wants a DIFFERENT time → put the new date/time in updates.visit_time and set action "reschedule_visit"
  - If user wants to CANCEL → set action "cancel_visit"
  - Otherwise → tell them their current booking and ask if they want to reschedule or cancel
- ONLY accept visit times within office hours (${openTime} to ${closeTime})${weekOff ? ` and never on a ${weekOff} (weekly day off)` : ''}.
  If the customer asks for a time outside that window (e.g. 1 AM)${weekOff ? ` or on a ${weekOff}` : ''}, politely
  ask them to pick a valid slot and do NOT set a booking action.
- The backend creates/cancels the appointment and sends confirmation emails. NEVER say "booked",
  "confirmed", "cancelled" or "rescheduled" UNLESS you set the matching action. The backend writes
  the final confirmation message, so keep your reply short and let the action do the work.
- Always refer to the existing appointment time exactly as shown in existing_appointment (already in India time).
- Never restart from step 1 if CURRENT LEAD DATA already contains answers or CURRENT CHAT HISTORY shows an ongoing conversation.
- Continue from the highest known point in the flow. If name, intent, area, budget, or appointment time are already known, do not ask for them again unless the customer is clearly changing that detail.

CURRENT LEAD STATE (source of truth — never override these values with guesswork):
${leadContext}

RULES FOR THIS STATE:
- If a field is already known in CURRENT LEAD STATE, do not ask for it again unless the customer explicitly changes it.
- If CURRENT LEAD STATE says an appointment or visit time already exists, continue from that point instead of restarting the funnel.

CURRENT CHAT HISTORY (most recent context, oldest to newest):
${historyContext}
${propertiesBlock}
${ragBlock}

SILENT PROFILING (this is our private sales intelligence — NEVER mention it, never
let the customer notice): from the conversation so far, infer subtle, useful traits
and put any you have REAL evidence for in "personality_cues". Examples of keys:
values_vastu (true if they care about Vastu/direction/religion), time_pref
("morning"|"evening"|"weekend"), budget_sensitive (true), investor (true if buying
to invest, not to live), family_buyer (true), urgency ("high"|"low"), decisiveness
("high"|"low"), tone_pref ("warm"|"formal"). Only include a trait when the messages
genuinely support it — never guess. Omit the field entirely if nothing is clear.

RESPOND WITH VALID JSON ONLY. No text outside the JSON block.

{
  "stage": "greeting|language|name|intent|qualifying|property_shown|awaiting_visit_time|awaiting_email|visit_confirmed|handover",
  "reply": "your WhatsApp message to the customer",
  "action": null or "search_properties"|"send_photos"|"book_visit"|"reschedule_visit"|"cancel_visit"|"share_contact"|"handover",
  "updates": {
    "name": "string or omit",
    "language": "en|hi|hinglish or omit",
    "intent": "rent|buy or omit",
    "preferred_areas": ["area"] or omit,
    "budget_max": number or omit,
    "bhk": "2BHK" or omit,
    "sqft_preference": number or omit,
    "visit_time": "ALWAYS full ISO with the resolved date+time, e.g. '2026-07-05T13:00' (compute from TODAY above) or omit",
    "email": "string or omit"
  },
  "personality_cues": { "values_vastu": true, "time_pref": "evening" } or omit
}`
}

// ─── Parse AI JSON safely ──────────────────────────────────────────────────────

function parseAIDecision(raw: string): AIDecision | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    return JSON.parse(match[0]) as AIDecision
  } catch {
    return null
  }
}

function getTutorialDecision(messageCount: number, message: string, agent: any, lead: any): TutorialDecision | null {
  const clean = (message || '').trim()
  const email = lead?.email || agent?.email || ''
  if (messageCount === 1) {
    return {
      reply: "Hello! I'd love to help you with your property search. Which language are you most comfortable in: English, Hindi, or Hinglish?",
    }
  }
  if (messageCount === 2) {
    const wantsHindi = /hindi/i.test(clean)
    const wantsHinglish = /hinglish/i.test(clean)
    return {
      reply: wantsHindi
        ? 'Great, we can continue in Hindi. May I know your name?'
        : wantsHinglish
          ? 'Perfect, we can continue in Hinglish. May I know your name?'
          : 'Perfect, we can continue in English. May I know your name?',
      updates: { language: wantsHindi ? 'hi' : wantsHinglish ? 'hinglish' : 'en' },
    }
  }
  if (messageCount === 3) {
    const extracted = clean.match(/my name is\s+(.+)/i)?.[1]?.trim() || clean
    const firstName = extracted.replace(/[.!,]+$/g, '').trim()
    return {
      reply: `Nice to meet you, ${firstName}. Are you looking to rent or buy, and what kind of home are you searching for?`,
      updates: { name: firstName },
    }
  }
  if (messageCount === 4) {
    return {
      reply: "Got it. You're looking to buy a 2 BHK in Wakad. What budget would you like me to work with?",
      updates: { intent: 'buy', preferred_areas: ['Wakad'], bhk: '2 BHK' },
    }
  }
  if (messageCount === 5) {
    return {
      reply: "Thanks, that's helpful.",
      updates: { budget_max: 9000000 },
      action: 'search_properties',
    }
  }
  if (messageCount === 6) {
    return {
      reply: 'Excellent choice. What day and time would suit you for a site visit?',
    }
  }
  if (messageCount === 7) {
    return {
      reply: `I can try to arrange that slot. Please share your email address so I can send the visit confirmation to you and ${agent?.name || 'our team'}.`,
      updates: { visit_time: clean },
    }
  }
  if (messageCount === 8) {
    return {
      reply: email && clean === email
        ? `Thanks. I'm confirming the visit now and the email confirmation will be sent to ${clean}.`
        : "Thanks. I'm confirming the visit now and I'll send the email confirmation there.",
      updates: { email: clean },
      action: 'book_visit',
    }
  }
  return null
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
        stage:
          messageCount <= 2 ? 'language' :
          messageCount === 3 ? 'name' :
          messageCount <= 5 ? 'qualifying' :
          messageCount === 6 ? 'property_shown' :
          messageCount === 7 ? 'awaiting_visit_time' :
          'awaiting_email',
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

      decision = parseAIDecision(raw)
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
      searchReply = `I looked through all our ${intent === 'rent' ? 'rental' : 'sale'} properties in ${areaText} but don't have a match right now. 😔\n\nTo serve you better, shall I schedule a call with our team? They may have options that aren't listed yet.`
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

  // Note: book_visit handler deferred to after leadUpdates is ready
  // (see below after line ~510)

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

  // Shared helper: create an appointment + send confirmation emails.
  // Returns the customer-facing message (clean success, or honest failure).
  async function createAppointment(visitTime: string, propertyId: string): Promise<string> {
    const leadName = leadUpdates.name || bookingLeadState?.name || lead.name || 'Guest'
    const customerEmail = leadUpdates.email || bookingLeadState?.email || lead.email

    const { error: appointmentErr } = await supabaseAdmin
      .from('appointments')
      .insert({ agent_id: agentId, lead_id: lead.id, property_id: propertyId, scheduled_at: visitTime, status: 'upcoming' })
      .select()
      .single()

    if (appointmentErr) {
      // Did it actually land despite the error? If not, be honest + alert.
      const { data: verify } = await supabaseAdmin
        .from('appointments').select('id').eq('lead_id', lead.id).eq('status', 'upcoming').maybeSingle()
      if (!verify) {
        console.error(`[ai-bot] appointment creation FAILED for ${phone}:`, appointmentErr.message)
        await emailSuperadmin(
          '⚠️ Appointment Creation Failed',
          `Site visit booking FAILED\n\nLead: ${leadName}\nPhone: ${phone}\nEmail: ${customerEmail}\nRequested Time: ${visitTime}\n\nError: ${appointmentErr.message}`
        )
        return `I'm having a small issue saving your visit. Our team will call you shortly to confirm the slot. 🙏`
      }
    }

    console.log(`[ai-bot] appointment saved for ${phone} at ${visitTime}`)
    await supabaseAdmin.from('leads').update({
      status: 'visit_booked',
      bot_stage: 'visit_confirmed',
      pending_appointment_time: null,
      pending_appointment_set_at: null,
      confirmation_followup_sent_at: null,
      nurture_state: 'paused',
      window_nudge_count: 0,
      last_nudge_at: null,
      nurture_plan: null,
      plan_d_touches: 0,
    }).eq('id', lead.id)
    const { data: prop } = await supabaseAdmin.from('properties').select('title').eq('id', propertyId).single()
    const propertyTitle = prop?.title || 'Selected Property'
    if (customerEmail) await sendCustomerConfirmation(customerEmail, leadName, propertyTitle, visitTime)
    if (agent!.email) await sendAgentNotification(agent!.email, leadName, phone, customerEmail || 'Not provided', propertyTitle, visitTime)

    return `✅ Your site visit is confirmed for ${formatIST(visitTime)}.` +
      (customerEmail ? ` A confirmation email is on its way to ${customerEmail}.` : '') +
      ` See you then, ${leadName}! 😊`
  }

  // 8. Booking actions — run BEFORE we reply, so the message matches reality.
  if (decision.action === 'cancel_visit') {
    if (existingAppointment) {
      await supabaseAdmin.from('appointments').update({ status: 'cancelled' }).eq('id', existingAppointment.id)
      finalReply = `Done — your site visit for ${formatIST(existingAppointment.scheduled_at)} has been cancelled. Would you like to book a new time? 😊`
    } else {
      finalReply = `You don't have an upcoming site visit to cancel. Would you like to book one? 😊`
    }

  } else if (decision.action === 'reschedule_visit') {
    // Troll/abuse halt: cap reschedules. Each reschedule adds one appointment
    // row, so total rows = 1 original + N reschedules. At 4 reschedules already
    // done (5 rows), stop accepting more and hand off to a human — this prevents
    // someone wasting endless messages/tokens by rescheduling forever.
    const { count: apptCount } = await supabaseAdmin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('lead_id', lead.id)
    const RESCHEDULE_LIMIT = 5 // 1 booking + 4 reschedules

    if ((apptCount || 0) >= RESCHEDULE_LIMIT) {
      finalReply = `I see you've changed your visit time a few times already. To make sure we get it right, our team will personally connect with you to finalise a slot. 🙏`
      await notifyAgentOfTrollHalt(agent, lead, phone, 'too many reschedules')
    } else if (!newTime) {
      finalReply = `Sure, let's reschedule! What new date and time works for you? (e.g. "tomorrow 3 PM")`
    } else if (bookingTimeIssue(newTime, agent)) {
      // Outside office hours / day off — don't cancel the old visit; ask again.
      finalReply = bookingTimeIssue(newTime, agent)!
    } else {
      // Cancel the old visit, then book the new time on the same property.
      await supabaseAdmin.from('appointments').update({ status: 'cancelled' }).eq('id', existingAppointment!.id)
      const propertyId = resolvedMatchedPropertyId || existingAppointment!.property_id
      finalReply = await createAppointment(newTime, propertyId)
    }

  } else if (decision.action === 'book_visit') {
    const visitTime = newTime || bookingLeadState?.pending_appointment_time || lead.pending_appointment_time
    const propertyId = resolvedMatchedPropertyId || bookingLeadState?.matched_property_id || existingAppointment?.property_id

    if (existingAppointment) {
      // Don't double-book — offer reschedule or cancel.
      finalReply = `You already have a site visit booked for ${formatIST(existingAppointment.scheduled_at)}. Would you like to reschedule it to a new time, or cancel it? 😊`
    } else if (!visitTime || !propertyId) {
      const leadName = leadUpdates.name || lead.name || phone
      console.error('[ai-bot] booking missing data', {
        lead_id: lead.id,
        visitTime: visitTime || null,
        propertyId: propertyId || null,
        pendingFromDb: bookingLeadState?.pending_appointment_time || null,
        matchedFromDb: bookingLeadState?.matched_property_id || null,
        matchedResolved: resolvedMatchedPropertyId || null,
        tutorialMode: !!tutorialMode,
      })
      finalReply = `I have your details — our team will reach out shortly to lock in your visit slot. 🙏`
      await emailSuperadmin(
        '⚠️ Booking could not complete (missing data)',
        `A booking was triggered but data was missing.\n\nLead: ${leadName}\nPhone: ${phone}\nEmail: ${leadUpdates.email || lead.email || 'MISSING'}\nVisit time: ${visitTime || 'MISSING'}\nProperty: ${propertyId || 'MISSING — no property matched yet'}`
      )
    } else if (bookingTimeIssue(visitTime, agent)) {
      // Outside office hours / day off — ask for a valid slot, don't book it.
      console.error('[ai-bot] booking blocked by schedule', {
        lead_id: lead.id,
        visitTime,
        weekly_off: agent.weekly_off || null,
        office_open: agent.office_open || null,
        office_close: agent.office_close || null,
      })
      finalReply = bookingTimeIssue(visitTime, agent)!
    } else {
      finalReply = await createAppointment(visitTime, propertyId)
    }
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
