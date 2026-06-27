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

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_HISTORY = 12   // max chat entries to keep (6 exchanges)
const MAX_PHOTOS = 5

// ─── Time Parsing ────────────────────────────────────────────────────────────────

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000 // India is UTC+5:30

// Human-friendly India-time label, e.g. "Mon, 23 Jun, 03:00 PM". Always renders
// in IST regardless of the server timezone, so the bot and emails agree.
function formatIST(isoTime: string): string {
  try {
    return new Date(isoTime).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return isoTime
  }
}

// The IST hour (0-23) of a visit time built by parseTimeString (always +05:30).
function visitHourIST(isoTime: string): number {
  const m = (isoTime || '').match(/T(\d{2}):/)
  return m ? parseInt(m[1]) : -1
}

// Parse an hours label like "09:00", "9:00 AM", "7 PM" → hour 0-23.
function parseHourLabel(label: string): number | null {
  const m = (label || '').trim().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (!m) return null
  let h = parseInt(m[1])
  const ap = (m[3] || '').toLowerCase()
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  return h
}

// Turn a stored label like "09:00" / "19:00" into human "9 AM" / "7 PM".
function humanizeTimeLabel(label: string): string {
  const m = (label || '').trim().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (!m) return label
  let h = parseInt(m[1])
  const min = m[2] ? parseInt(m[2]) : 0
  const ap = (m[3] || '').toLowerCase()
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 || 12
  return min ? `${h12}:${String(min).padStart(2, '0')} ${period}` : `${h12} ${period}`
}

// The IST weekday name ("Sunday") of a visit time.
function visitWeekdayIST(isoTime: string): string {
  try {
    return new Date(isoTime).toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' })
  } catch {
    return ''
  }
}

// If the requested visit is outside office hours OR on the agent's weekly day
// off, returns a friendly message asking for a better slot; otherwise null.
function bookingTimeIssue(visitTime: string, agent: any): string | null {
  // Weekly day off (e.g. "Sunday") — only checked if the agent set one.
  if (agent.weekly_off) {
    const wd = visitWeekdayIST(visitTime)
    if (wd && wd.toLowerCase() === String(agent.weekly_off).toLowerCase()) {
      return `We're closed on ${agent.weekly_off}s. Could you pick another day? 😊`
    }
  }
  // Office hours.
  const openLabel = humanizeTimeLabel(agent.office_open || '09:00')
  const closeLabel = humanizeTimeLabel(agent.office_close || '19:00')
  const openH = parseHourLabel(agent.office_open || '09:00') ?? 9
  const closeH = parseHourLabel(agent.office_close || '19:00') ?? 19
  const h = visitHourIST(visitTime)
  if (h >= 0 && (h < openH || h >= closeH)) {
    return `Our site visits are between ${openLabel} and ${closeLabel}. Could you pick a time within those hours? 😊`
  }
  return null
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim())
}

function parseTimeString(timeStr: string): string | null {
  if (!timeStr) return null
  const t = timeStr.toLowerCase().trim()

  // FIRST: if a full ISO-style date is present (e.g. "2026-06-22" or
  // "2026-06-22 11:00" or "2026-06-22T11:00"), read it exactly. This MUST run
  // before the loose patterns below — otherwise the "2026" year gets misread
  // (the old code grabbed "26" as the day, turning the 22nd into the 26th).
  const isoMatch = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:[t\s]+(\d{1,2}):(\d{2}))?/)
  if (isoMatch) {
    const y = parseInt(isoMatch[1])
    const mo = parseInt(isoMatch[2]) - 1
    const d = parseInt(isoMatch[3])
    let h = isoMatch[4] != null ? parseInt(isoMatch[4]) : 11 // default 11 AM if no time given
    let mi = isoMatch[5] != null ? parseInt(isoMatch[5]) : 0
    // Honour an am/pm that may appear after the time (e.g. "2026-06-22 3 pm")
    const ap = t.match(/(am|pm)/)
    if (ap) {
      if (ap[1] === 'pm' && h < 12) h += 12
      if (ap[1] === 'am' && h === 12) h = 0
    }
    const cal = new Date(Date.UTC(y, mo, d))
    const yyyy = String(cal.getUTCFullYear())
    const mm = String(cal.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(cal.getUTCDate()).padStart(2, '0')
    const hh = String(h).padStart(2, '0')
    const min = String(mi).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}T${hh}:${min}:00+05:30`
  }

  // Extract time. Prefer an explicit am/pm time, then HH:MM, then a bare hour —
  // so a day-of-month number ("5th") is never mistaken for the hour.
  let hours = 0
  let mins = 0
  const ampmMatch = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
  const colonMatch = t.match(/\b(\d{1,2}):(\d{2})\b/)
  const bareMatch = t.match(/\b(\d{1,2})\s*o'?clock\b/i)
  if (ampmMatch) {
    hours = parseInt(ampmMatch[1]); mins = ampmMatch[2] ? parseInt(ampmMatch[2]) : 0
    const ampm = ampmMatch[3].toLowerCase()
    if (ampm === 'pm' && hours < 12) hours += 12
    if (ampm === 'am' && hours === 12) hours = 0
  } else if (colonMatch) {
    hours = parseInt(colonMatch[1]); mins = parseInt(colonMatch[2])
  } else if (bareMatch) {
    hours = parseInt(bareMatch[1])
  } else {
    return null // No usable time found — caller will ask again
  }

  // Work entirely in IST. The server runs on UTC, so we shift "now" by +5:30
  // and read the UTC fields — that gives us today's date AS IT IS IN INDIA,
  // which is what "today"/"tomorrow" must be relative to.
  const istNow = new Date(Date.now() + IST_OFFSET_MS)
  let year = istNow.getUTCFullYear()
  let month = istNow.getUTCMonth() // 0-based
  let day = istNow.getUTCDate()

  if (t.includes('tomorrow') || t.includes('next day')) {
    day += 1
  } else if (t.match(/today|this\s+morning|this\s+afternoon/)) {
    // keep today's IST date
  } else if (t.match(/day\s+after\s+tomorrow|in\s+2\s+days?/)) {
    day += 2
  } else if (t.match(/next\s+week/)) {
    day += 7
  } else if (t.match(/\b(\d{1,2})[-/](\d{1,2})\b/)) {
    // Explicit short date like "22-6" or "22/6" — assume dd-mm (common in India)
    const parts = t.match(/\b(\d{1,2})[-/](\d{1,2})\b/)
    if (parts) {
      day = parseInt(parts[1])
      month = parseInt(parts[2]) - 1
    }
  } else if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(t)) {
    // Month-name date: "5 july", "5th july", "july 5". The day is the number NOT
    // followed by am/pm (so "1pm" isn't read as the day). If the date is already
    // past this year, assume next year.
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    const mName = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i)
    const dNum = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b(?!\s*[ap]\.?m)/i)
    if (mName && dNum) {
      month = months.indexOf(mName[1].toLowerCase())
      day = parseInt(dNum[1])
      const todayUtc = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate())
      if (Date.UTC(year, month, day) < todayUtc) year += 1
    }
  }

  // Normalise (handles day/month roll-over like 31 + 1) using a UTC date as a
  // pure calendar calculator — no timezone shifting happens here.
  const cal = new Date(Date.UTC(year, month, day))
  year = cal.getUTCFullYear()
  month = cal.getUTCMonth()
  day = cal.getUTCDate()

  // Format as ISO8601 with IST timezone (+05:30) — the time the user intended.
  const yyyy = String(year)
  const mm = String(month + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  const hh = String(hours).padStart(2, '0')
  const min = String(mins).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:00+05:30`
}

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(agent: any, lead: any, existingAppointment: any, properties?: any[], recentHistory: ChatEntry[] = [], propertyRag?: string): string {
  const lang = lead.language || 'en'
  const langLabel =
    lang === 'hi' ? 'Hindi' :
    lang === 'hinglish' ? 'Hinglish (Hindi written in English letters)' :
    'English'

  const agentName = agent.name || 'our team'
  const agencyName = agent.agency_name || 'our agency'
  const openTime = humanizeTimeLabel(agent.office_open || '09:00')
  const closeTime = humanizeTimeLabel(agent.office_close || '19:00')
  const weekOff = agent.weekly_off || null

  const leadContext = buildLeadMemoryContext(lead, existingAppointment ? {
    scheduled_at: formatIST(existingAppointment.scheduled_at),
    status: existingAppointment.status,
  } : null)

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

  return `You are a WhatsApp property assistant for ${agentName} (${agencyName}).
Office hours: ${openTime} to ${closeTime}${weekOff ? `, closed on ${weekOff}s` : ''}.

TODAY (India time) is ${todayIST}. Resolve every date the user mentions relative
to this — "5th July", "tomorrow", "next Monday" — and ALWAYS put visit_time as a
full ISO date "YYYY-MM-DDTHH:MM" (e.g. 2026-07-05T13:00). Never guess the weekday;
compute it from today's date above.

LANGUAGE: Always reply in ${langLabel} only. Never switch unless the user explicitly asks.

CONVERSATION FLOW (follow this order, skip what is already known):
1. Greet warmly
2. Ask language preference (English / Hindi / Hinglish)
3. Ask their name
4. Ask: looking to Rent or Buy?
5. Ask: which area?
6. Ask: monthly budget? (for rent) or total budget? (for buy)
7. Ask: how many bedrooms? (1BHK / 2BHK / 3BHK etc.)
8. Once you have intent + area → set action to "search_properties"
9. Present matched properties using ONLY the data provided
10. Offer photos when presenting properties ("Would you like photos?")
11. When user wants to visit → ASK for preferred date and time (e.g., "tomorrow at 11 AM")
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

CURRENT LEAD DATA:
${leadContext}

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

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function handleAiBotMessage(opts: {
  phone: string
  message: string
  agentId: string
  channel: WaChannel   // how to reply — MSG91 or Meta Cloud API direct
  simulate?: boolean   // onboarding simulation: run the real bot but DON'T send
                       // real WhatsApp messages (replies are still saved to the inbox)
}): Promise<void> {
  const { phone, message, agentId, channel, simulate } = opts

  // 1. Load agent
  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('id, name, agency_name, phone, email, office_open, office_close, weekly_off, msg91_integrated_number')
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

  // Manual mode must silence the bot regardless of which route invoked it.
  if (lead.bot_paused) {
    console.log(`[ai-bot] bot paused for ${phone}; skipping reply`)
    return
  }

  // 3. Add incoming message to chat history
  const history: ChatEntry[] = Array.isArray(lead.chat_history) ? lead.chat_history : []
  history.push({ role: 'user', text: message, ts: new Date().toISOString() })
  const messageCount = history.filter(entry => entry.role === 'user').length

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
    .eq('is_sample', false)

  const activeProperties = excludeSampleProperties((propertiesRaw || []) as any[])
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

  const currentStage = detectStage(lead, messageCount)

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
  try {
    const raw = await callLLM([
      { role: 'system', content: buildSystemPrompt(agent, lead, existingAppointment, activeProperties, history.slice(-8), propertyRag) },
      { role: 'user', content: `Conversation:\n${conversationText}\n\nRespond with JSON only.` },
    ], { maxTokens: 600, temperature: 0.35 })

    decision = parseAIDecision(raw)
  } catch (err) {
    console.error('[ai-bot] LLM error (first call):', err)
  }

  if (!decision) {
    await waSendText(channel, phone, "I'm having a small issue — please try again in a moment. 🙏")
    return
  }

  let finalReply = decision.reply
  let searchReply: string | null = null  // second message sent after "let me check"
  const photosToSend: string[] = []

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
    }
  }

  if (decision.action === 'send_photos') {
    const propertyId = lead.matched_property_id
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

  // Shared helper: create an appointment + send confirmation emails.
  // Returns the customer-facing message (clean success, or honest failure).
  async function createAppointment(visitTime: string, propertyId: string): Promise<string> {
    const leadName = leadUpdates.name || lead.name || 'Guest'
    const customerEmail = leadUpdates.email || lead.email

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
      const propertyId = lead.matched_property_id || existingAppointment!.property_id
      finalReply = await createAppointment(newTime, propertyId)
    }

  } else if (decision.action === 'book_visit') {
    const visitTime = newTime || lead.pending_appointment_time
    const propertyId = lead.matched_property_id || existingAppointment?.property_id

    if (existingAppointment) {
      // Don't double-book — offer reschedule or cancel.
      finalReply = `You already have a site visit booked for ${formatIST(existingAppointment.scheduled_at)}. Would you like to reschedule it to a new time, or cancel it? 😊`
    } else if (!visitTime || !propertyId) {
      const leadName = leadUpdates.name || lead.name || phone
      finalReply = `I have your details — our team will reach out shortly to lock in your visit slot. 🙏`
      await emailSuperadmin(
        '⚠️ Booking could not complete (missing data)',
        `A booking was triggered but data was missing.\n\nLead: ${leadName}\nPhone: ${phone}\nEmail: ${leadUpdates.email || lead.email || 'MISSING'}\nVisit time: ${visitTime || 'MISSING'}\nProperty: ${propertyId || 'MISSING — no property matched yet'}`
      )
    } else if (bookingTimeIssue(visitTime, agent)) {
      // Outside office hours / day off — ask for a valid slot, don't book it.
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
