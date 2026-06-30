// lib/promptBuilder.ts
// System prompt builder for the AI bot engine.
// Extracted from ai-bot.ts to keep the orchestrator focused on flow control.
// All functions are pure — no DB, no API, no side effects.

import { formatIST, humanizeTimeLabel } from './timeParser'
import { needsTranslation } from './translate'
import { buildLeadMemoryContext } from './leadMemory'

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

export type ChatEntry = {
  role: 'user' | 'bot'
  text: string
  ts: string
}

export type AIDecision = {
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

export type TutorialDecision = {
  reply: string
  updates?: Record<string, any>
  action?: AIDecision['action']
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_HISTORY = 12   // max chat entries to keep (6 exchanges)
export const MAX_PHOTOS = 5

// ─── System Prompt Builder ────────────────────────────────────────────────────

export function buildSystemPrompt(
  agent: any,
  lead: any,
  existingAppointment: any,
  properties?: any[],
  recentHistory: ChatEntry[] = [],
  propertyRag?: string
): string {
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

export function parseAIDecision(raw: string): AIDecision | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    return JSON.parse(match[0]) as AIDecision
  } catch {
    return null
  }
}

// ─── Tutorial Decision Engine ─────────────────────────────────────────────────

export function getTutorialDecision(messageCount: number, message: string, agent: any, lead: any): TutorialDecision | null {
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