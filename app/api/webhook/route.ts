export const dynamic = "force-dynamic"
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendViaMsg91, sendViaMsg91Media, sendWithRetry } from '@/lib/whatsapp'
import { buildAgentContactCard } from '@/lib/fallbackCard'
import { callLLM, type ChatMessage } from '@/lib/llm'
import { verifySharedSecret } from '@/lib/webhookAuth'
import { createLogger } from '@/lib/logger'
import { checkRateLimit } from '@/lib/rateLimit'
import { randomUUID } from 'crypto'
import * as Sentry from '@sentry/nextjs'

// ─── Template Replies ────────────────────────────────────────────────────────
const T = {
  greeting: (name: string) =>
    `Hi${name ? ` ${name}` : ''}! Welcome to Convorian. Are you looking to BUY or RENT a property?`,

  ask_area: () =>
    'Great! Which area or locality are you interested in?',

  property_found: (props: any[]) => {
    if (!props.length) return ''
    const blocks = props.slice(0, 3).map((p: any) => {
      const price = p.type === 'rental'
        ? `₹${Math.round(Number(p.rent_per_month || p.price || 0)).toLocaleString('en-IN')}/month`
        : `₹${Math.round(Number(p.price || 0)).toLocaleString('en-IN')}`
      const lines = [
        `🏠 *${p.title || 'Property'}*${p.location ? ` in ${p.location}` : ''}`,
        `💰 ${price}`,
        p.bhk ? `🛏️ ${p.bhk}` : '',
        p.size_sqft ? `📐 ${p.size_sqft} sqft` : '',
        p.category ? `🏷️ ${p.category}` : '',
      ].filter(Boolean)
      return lines.join('\n')
    })
    let text = `Here are properties available in ${props[0]?.location || 'your area'}:\n\n${blocks.join('\n\n')}`
    if (props.length > 3) text += '\n\nI have more options too! Would you like to schedule a visit?'
    return text
  },

  no_match: () =>
    "I don't have a property matching that exactly right now.",

  no_match_ai: (msg: string) =>
    msg || "I don't have a property matching that exactly right now. Would you like me to connect you with our agent who can help find the right property for you?",

  booking_start: () =>
    'Sure! Let me help you book a site visit. Please tell me the date and time that works for you (e.g., "tomorrow at 11 AM" or "Saturday at 5 PM").',

  booking_time_ack: (time: string) =>
    `Perfect — I\'ll schedule your site visit for ${time}. Just reply "Confirm" or "Yes" to lock it in, or let me know a different time that works better.`,

  booking_confirmed: (time: string) =>
    `Perfect, you\'re all set! ✅ Your site visit is confirmed for ${time}. Our team will share the exact location details before the visit. Looking forward to it!`,

  booking_out_of_hours: (open: string, close: string) =>
    `Our site visits are between ${open} and ${close}. Could you please pick a time in that window? For example, "tomorrow at 11 AM".`,

  booking_past: () =>
    'That time has already passed. Could you give me a future date and time for the visit? For example, "tomorrow at 11 AM" or "Saturday at 5 PM".',

  agent_card: (agent: any) =>
    `Sure, here are the agent\'s details:\n\n${buildAgentContactCard(agent)}`,

  unknown: () =>
    "I didn't quite understand that. Could you please tell me what you're looking for? For example, say 'I want to rent a 2BHK in Baner' or 'Show me properties'.",
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function isGreeting(t: string): boolean {
  const n = normalizeText(t)
  const greetings = ['hi', 'hello', 'hey', 'good morning', 'good evening', 'good afternoon', 'hii', 'hiii', 'helo', 'hlo', 'namaste', 'namaskar']
  return greetings.some(g => n === g || n.startsWith(g + ' ') || n.endsWith(' ' + g))
}

function isIntent(t: string): 'buy' | 'rent' | null {
  const n = normalizeText(t)
  if (/\b(buy|purchase|khareed|kharid|lena|kharidi|sale)\b/i.test(n)) return 'buy'
  if (/\b(rent|rental|lease|kiraya|bhade|kirane)\b/i.test(n)) return 'rent'
  return null
}

function isBookingRequest(t: string): boolean {
  const n = normalizeText(t)
  return /\b(book|schedule|visit|appointment|site visit|booking|fix)\b/i.test(n)
    && /(time|date|today|tomorrow|kal|slot|visit|appointment)/i.test(n)
}

function isContactRequest(t: string): boolean {
  const n = normalizeText(t)
  return /\b(agent|contact|number|phone|call|baat|talk|speak|person|human|manager)\b/i.test(n)
    && !isBookingRequest(t)
}

function isConfirmation(t: string): boolean {
  const n = normalizeText(t)
  const affirmatives = ['yes', 'confirm', 'confirmed', 'haan', 'ha', 'hmm', 'ok', 'okay', 'sure', 'theek hai', 'thik', 'pakka', 'bilkul']
  return affirmatives.some(a => n === a || n.startsWith(a + ' ') || n.endsWith(' ' + a))
}

function extractArea(t: string): string | null {
  // Generic area detection — returns the first locality mention
  // Can be expanded with a proper area list later
  const n = normalizeText(t)
  // Try to extract area after "in" or "at" or "mein" or "madhe"
  const match = n.match(/(?:in|at|mein|madhe)\s+([a-z\s]+?)(?:\s+(?:for|with|budget|rent|buy|bhk|under|upto|up\s*to|\d)|$)/i)
  if (match) {
    const area = match[1].trim()
    if (area.length >= 3 && area.length <= 50) return area
  }
  return null
}

function extractBudget(t: string): number | null {
  const n = normalizeText(t)
  // Match amounts like 30k, 20k, 1.5cr, 50l, 1000000
  const lakhMatch = n.match(/(\d+(?:\.\d+)?)\s*l/i)
  if (lakhMatch) return parseFloat(lakhMatch[1]) * 100000
  
  const croreMatch = n.match(/(\d+(?:\.\d+)?)\s*cr/i)
  if (croreMatch) return parseFloat(croreMatch[1]) * 10000000

  const kMatch = n.match(/(\d+)\s*k/i)
  if (kMatch) return parseInt(kMatch[1]) * 1000

  // Plain number — if it's reasonable for rent (1000-999999) or sale
  const numMatch = n.match(/\b(\d{4,7})\b/)
  if (numMatch) return parseInt(numMatch[1])

  return null
}

function extractBHK(t: string): string | null {
  const n = normalizeText(t)
  const match = n.match(/(\d+)\s*bhk/i)
  if (match) return `${match[1]}bhk`
  return null
}

function formatIST(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const h = ist.getUTCHours()
    const m = ist.getUTCMinutes()
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 === 0 ? 12 : h % 12
    return `${ist.getUTCDate()} ${months[ist.getUTCMonth()]} ${h12}:${String(m).padStart(2, '0')} ${ampm} IST`
  } catch {
    return dateStr
  }
}

// Parse a natural-language date/time (e.g. "tomorrow at 11 AM", "Saturday 5pm",
// "kal 4 baje", "today 17:00") into a UTC ISO string, interpreting the wall-clock
// the customer means as IST. Returns null if no usable time is found.
function parseAppointmentTime(text: string): string | null {
  const n = text.toLowerCase() // keep colons/punctuation for time parsing

  // ── time of day ── prefer am/pm, then HH:MM, then "N baje", then a bare hour
  let hour: number | null = null
  let minute = 0
  let ampm: string | null = null

  const ampmMatch = n.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/)
  const colonMatch = n.match(/\b(\d{1,2}):(\d{2})\b/)
  const bajeMatch = n.match(/\b(\d{1,2})(?::(\d{2}))?\s*baje\b/)
  const bareMatch = n.match(/\b(\d{1,2})\b/)

  if (ampmMatch) {
    hour = parseInt(ampmMatch[1]); minute = ampmMatch[2] ? parseInt(ampmMatch[2]) : 0; ampm = ampmMatch[3]
  } else if (colonMatch) {
    hour = parseInt(colonMatch[1]); minute = parseInt(colonMatch[2])
  } else if (bajeMatch) {
    hour = parseInt(bajeMatch[1]); minute = bajeMatch[2] ? parseInt(bajeMatch[2]) : 0
  } else if (bareMatch) {
    hour = parseInt(bareMatch[1])
  }

  if (hour === null || hour > 23 || minute > 59) return null

  if (ampm === 'pm' && hour < 12) hour += 12
  else if (ampm === 'am' && hour === 12) hour = 0
  else if (!ampm && hour >= 1 && hour <= 7) hour += 12 // bare 1–7 → afternoon/evening (visits)

  // ── day ── compute against current IST wall-clock
  const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  const y = nowIst.getUTCFullYear(), mo = nowIst.getUTCMonth(), d = nowIst.getUTCDate()
  const curDow = nowIst.getUTCDay()
  let dayOffset: number | null = null
  let explicitDay = false

  if (/\b(day after tomorrow|parso|parason)\b/.test(n)) { dayOffset = 2; explicitDay = true }
  else if (/\b(tomorrow|kal|tmrw|tmr)\b/.test(n)) { dayOffset = 1; explicitDay = true }
  else if (/\b(today|aaj|aj)\b/.test(n)) { dayOffset = 0; explicitDay = true }
  else {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    for (let i = 0; i < days.length; i++) {
      if (new RegExp(`\\b${days[i]}\\b`).test(n)) { dayOffset = (i - curDow + 7) % 7; explicitDay = true; break }
    }
  }
  if (dayOffset === null) dayOffset = 0 // no day mentioned → today (may roll forward below)

  const buildUtc = (off: number) => Date.UTC(y, mo, d + off, hour as number, minute) - 5.5 * 60 * 60 * 1000
  let utcMs = buildUtc(dayOffset)
  // bare time already passed today → assume they mean tomorrow
  if (!explicitDay && utcMs < Date.now()) utcMs = buildUtc(dayOffset + 1)

  return new Date(utcMs).toISOString()
}

function prettyHour(h: number): string {
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12} ${ampm}`
}

// Check a booking instant against the agent's office hours (defaults 9 AM–7 PM IST).
function withinOfficeHours(iso: string, agent: any): { ok: boolean; open: string; close: string } {
  const oh = parseInt(String(agent?.office_open || '09:00').split(':')[0]) || 9
  const ch = parseInt(String(agent?.office_close || '19:00').split(':')[0]) || 19
  const ist = new Date(new Date(iso).getTime() + 5.5 * 60 * 60 * 1000)
  const h = ist.getUTCHours()
  return { ok: h >= oh && h < ch, open: prettyHour(oh), close: prettyHour(ch) }
}

function getPropertyPhotos(prop: any): string[] {
  if (!prop) return []
  const urls: string[] = []
  // From property_media column
  if (Array.isArray(prop.property_media)) urls.push(...prop.property_media.filter((u: string) => u.startsWith('http')))
  // From features media: entries
  if (Array.isArray(prop.features)) urls.push(...prop.features.filter((f: string) => f.startsWith('media:')).map((f: string) => f.replace('media:', '')))
  return urls.slice(0, 5)
}

// ─── AI Fallback ─────────────────────────────────────────────────────────────
async function aiDecode(messages: ChatMessage[], text: string): Promise<string> {
  try {
    const systemPrompt = `You are a real estate assistant for Convorian. Your ONLY job is to understand what the customer wants and respond helpfully.

Rules:
1. If the customer asks for a property, extract their intent (buy/rent), area, budget, BHK and respond confirming what they need.
2. If the customer's requested property/location is not available, apologize and offer to connect them with an agent.
3. If the customer asks a general question, answer briefly and politely.
4. If you don't understand, ask them to rephrase.
5. NEVER make up property details, prices, or facts.
6. Keep responses short and conversational.
7. If the customer seems ready to book a visit, say "Would you like me to book a site visit for you?"
8. If the customer wants an agent, offer to connect them.`

    const result = await callLLM([
      { role: 'system', content: systemPrompt },
      ...messages.slice(-6),
      { role: 'user', content: text },
    ], { maxTokens: 200, temperature: 0.7 })

    return result || ''
  } catch {
    return ''
  }
}

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

  try {
    // ── Auth ─────────────────────────────────────────────────────────────
    {
      const secret = process.env.MSG91_WEBHOOK_SECRET
      const devBypass = process.env.NODE_ENV !== 'production' && process.env.SKIP_WEBHOOK_AUTH === 'true'
      if (devBypass) log('auth_bypass', { note: 'dev mode' })
      else if (!secret) { logError('auth_misconfigured', {}); return NextResponse.json({ error: 'Misconfigured' }, { status: 500 }) }
      else {
        const incoming = request.headers.get('x-webhook-secret')
        if (!verifySharedSecret(incoming, secret)) {
          // Debug: log header presence and lengths to diagnose mismatch (no values exposed)
          logError('auth_rejected', {
            header_present: !!incoming,
            incoming_len: incoming?.length ?? 0,
            expected_len: secret.length,
          })
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
      }
    }

    // ── Rate limit ──────────────────────────────────────────────────────
    {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
      if (!checkRateLimit(`ip:${ip}`, 60, 60000).allowed) return NextResponse.json({ status: 'rate_limited' }, { status: 429 })
    }

    // ── Parse inbound ────────────────────────────────────────────────────
    const contentType = request.headers.get('content-type') || ''
    let fromPhone = '', messageText = '', waMessageId = '', msg91IntegratedNumber = '', forcedAgentId = ''
    let incomingProvider: 'msg91' | 'meta' = 'msg91'
    let isNonTextMedia = false

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await request.text()
      const params = new URLSearchParams(text)
      fromPhone = (params.get('From') || '').replace('whatsapp:', '').trim()
      if (fromPhone && !fromPhone.startsWith('+')) fromPhone = '+' + fromPhone
      messageText = params.get('Body') || ''
      waMessageId = params.get('MessageSid') || ''
      forcedAgentId = params.get('AgentId') || ''
      if (!messageText || !fromPhone) return NextResponse.json({ status: 'no_text' })
    } else {
      const body = await request.json()
      if (body.integratedNumber && (body.customerNumber || body.messages)) {
        incomingProvider = 'msg91'
        msg91IntegratedNumber = String(body.integratedNumber)
        fromPhone = body.customerNumber ? '+' + String(body.customerNumber).replace(/^\+/, '') : ''
        waMessageId = body.uuid || ''
        const pick = (...xs: any[]) => { for (const x of xs) if (typeof x === 'string' && x.trim()) return x; return '' }
        let btn = body.button; if (typeof btn === 'string') { try { btn = JSON.parse(btn) } catch {} }
        messageText = pick(body.text, btn?.text, btn?.payload, btn?.title, btn?.value,
          typeof body.button === 'string' && !body.button.startsWith('{') ? body.button : '',
          body.buttonText, body.button_text, body.payload, body.buttonPayload,
          body.interactive?.button_reply?.title, body.interactive?.button_reply?.id,
          body.interactive?.list_reply?.title, body.interactive?.list_reply?.id,
          body.content?.text, typeof body.content === 'string' ? body.content : '',
          body.message?.text, body.title)
        const ct = body.contentType
        if (ct && !['text', 'button', 'interactive', 'reply', 'quick_reply'].includes(ct) && !messageText) {
          if (fromPhone && msg91IntegratedNumber) try { await sendViaMsg91(msg91IntegratedNumber, fromPhone, "I can only read text messages — could you type your question? 😊") } catch {}
          return NextResponse.json({ status: 'ignored_non_text' })
        }
        if (!messageText || !fromPhone) { log('msg91_no_text', { payload: body }); return NextResponse.json({ status: 'no_text' }) }
      } else if (body.object === 'whatsapp_business_account') {
        incomingProvider = 'meta'
        const value = body.entry?.[0]?.changes?.[0]?.value
        if (!value?.messages?.length) return NextResponse.json({ status: 'no_messages' })
        const msg = value.messages[0]
        fromPhone = msg.from || ''
        messageText = msg.text?.body || ''
        waMessageId = msg.id || ''
        if (!messageText && msg.type && msg.type !== 'text') isNonTextMedia = true
        if (!messageText && !isNonTextMedia) return NextResponse.json({ status: 'no_text' })
      } else return NextResponse.json({ status: 'ignored' })
    }

    // ── Agent lookup ─────────────────────────────────────────────────────
    let agent: any = null
    if (incomingProvider === 'msg91') {
      const inboundNum = msg91IntegratedNumber.replace(/\D/g, '')
      if (inboundNum) {
        const { data } = await supabaseAdmin.from('agents').select('*').eq('msg91_integrated_number', inboundNum).maybeSingle()
        agent = data
      }
      if (!agent) {
        const testId = process.env.MSG91_TEST_AGENT_ID
        if (testId) { const { data } = await supabaseAdmin.from('agents').select('*').eq('id', testId).single(); agent = data }
      }
    } else if (forcedAgentId) {
      const { data } = await supabaseAdmin.from('agents').select('*').eq('id', forcedAgentId).single()
      agent = data
    }
    if (!agent) return NextResponse.json({ status: 'agent_not_found' })
    setContext({ agentId: agent.id })

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
      const { data: nl } = await supabaseAdmin.from('leads').insert({
        agent_id: agent.id, phone: fromPhone, last_message_at: now,
        window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        status: 'new', opted_in: true, opt_in_at: now, opt_in_source: 'whatsapp_inbound'
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
      if (incomingProvider === 'msg91') try { await sendViaMsg91(msg91IntegratedNumber, fromPhone, bye) } catch {}
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
        if (incomingProvider === 'msg91') await sendWithRetry(() => sendViaMsg91(msg91IntegratedNumber, fromPhone, safeReply))
        if (gOut?.id) await supabaseAdmin.from('messages').update({ status: 'sent' }).eq('id', gOut.id)
        return NextResponse.json({ status: 'guardrail', kind: g.label })
      }
    }

    // ═════════════════════════════════════════════════════════════════════
    // ── BOT LOGIC — Simple if-else chain ─────────────────────────────────
    // ═════════════════════════════════════════════════════════════════════

    log('bot_logic_start', { msg: messageText.slice(0, 80) })

    let reply = ''
    let photos: string[] = []
    let replyAction = ''
    let shouldAlertAgent = false

    // STEP 1: Check what stage the lead is at
    const leadStage = lead.conversation_stage || 'new'
    const storedIntent = lead.intent || null
    const storedArea = lead.preferred_areas?.[0] || null
    const storedPendingBooking = lead.pending_appointment_time || null

    // STEP 2: Handle the message based on stage
    if (isGreeting(messageText) && leadStage === 'new') {
      // New lead greeting
      reply = T.greeting(lead.name || '')
      replyAction = 'greeting'
      await supabaseAdmin.from('leads').update({ conversation_stage: 'awaiting_intent' }).eq('id', lead.id)

    } else if (leadStage === 'awaiting_intent' || (!storedIntent && !isGreeting(messageText))) {
      // We need intent
      const intent = isIntent(messageText)
      if (intent) {
        await supabaseAdmin.from('leads').update({ intent, conversation_stage: 'awaiting_area' }).eq('id', lead.id)
        reply = T.ask_area()
        replyAction = 'ask_area'
      } else {
        // Try AI to decode
        const aiReply = await aiDecode([], messageText)
        if (aiReply) {
          reply = aiReply
          replyAction = 'ai_unknown'
        } else {
          reply = T.unknown()
          replyAction = 'unknown'
        }
      }

    } else if (leadStage === 'awaiting_area' || (!storedArea && storedIntent)) {
      // We need area
      const area = extractArea(messageText)
      if (area) {
        // Check properties
        const { data: props } = await supabaseAdmin.from('properties')
          .select('*').eq('agent_id', agent.id).eq('status', 'active')
          .ilike('location', `%${area}%`)

        if (props && props.length > 0) {
          await supabaseAdmin.from('leads').update({
            preferred_areas: [area],
            conversation_stage: 'presenting',
          }).eq('id', lead.id)
          reply = T.property_found(props)
          photos = getPropertyPhotos(props[0])
          replyAction = 'present'
        } else {
          // No properties — AI handles
          const recentMsgs = await supabaseAdmin.from('messages')
            .select('direction, content').eq('lead_id', lead.id)
            .order('created_at', { ascending: false }).limit(10)
          const recent = (recentMsgs.data || []).reverse().map(m => ({
            role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: m.content || '',
          }))
          const aiReply = await aiDecode(recent, messageText)
          reply = aiReply || T.no_match_ai('')
          replyAction = 'ai_no_match'
          // Offer agent card as fallback
          if (!aiReply) {
            reply = `${T.no_match()}\n\n${T.agent_card(agent)}`
            replyAction = 'no_match_card'
          }
          await supabaseAdmin.from('leads').update({ conversation_stage: 'no_match_ai' }).eq('id', lead.id)
        }
      } else {
        // No area found in message
        reply = T.ask_area()
        replyAction = 'ask_area_again'
      }

    } else if (storedPendingBooking && isConfirmation(messageText)) {
      // Booking confirmation
      const time = formatIST(storedPendingBooking)
      await supabaseAdmin.from('appointments').insert({
        agent_id: agent.id, lead_id: lead.id,
        scheduled_at: storedPendingBooking, status: 'upcoming',
      }).select()
      await supabaseAdmin.from('leads').update({
        status: 'visit_booked', pending_appointment_time: null, conversation_stage: 'booked',
      }).eq('id', lead.id)

      reply = T.booking_confirmed(time)
      replyAction = 'booking_confirmed'
      shouldAlertAgent = true

    } else if (isBookingRequest(messageText) || leadStage === 'awaiting_booking') {
      // Handle booking request — parse the actual date/time the customer gave
      const parsed = parseAppointmentTime(messageText)
      if (parsed) {
        if (new Date(parsed).getTime() < Date.now() - 60 * 1000) {
          // Resolved to a time in the past
          await supabaseAdmin.from('leads').update({ conversation_stage: 'awaiting_booking' }).eq('id', lead.id)
          reply = T.booking_past()
          replyAction = 'booking_past'
        } else {
          const oh = withinOfficeHours(parsed, agent)
          if (!oh.ok) {
            await supabaseAdmin.from('leads').update({ conversation_stage: 'awaiting_booking' }).eq('id', lead.id)
            reply = T.booking_out_of_hours(oh.open, oh.close)
            replyAction = 'booking_out_of_hours'
          } else {
            // Stage the parsed time; ask for a Confirm to lock it in
            await supabaseAdmin.from('leads').update({
              pending_appointment_time: parsed, conversation_stage: 'awaiting_booking',
            }).eq('id', lead.id)
            reply = T.booking_time_ack(formatIST(parsed))
            replyAction = 'booking_time_ack'
          }
        }
      } else {
        // No usable date/time in the message — ask for one
        await supabaseAdmin.from('leads').update({ conversation_stage: 'awaiting_booking' }).eq('id', lead.id)
        reply = T.booking_start()
        replyAction = 'booking_start'
      }

    } else if (isContactRequest(messageText)) {
      reply = T.agent_card(agent)
      replyAction = 'contact_card'

    } else {
      // Unknown — AI fallback
      const recentMsgs = await supabaseAdmin.from('messages')
        .select('direction, content').eq('lead_id', lead.id)
        .order('created_at', { ascending: false }).limit(10)
      const recent = (recentMsgs.data || []).reverse().map(m => ({
        role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content || '',
      }))
      const aiReply = await aiDecode(recent, messageText)
      reply = aiReply || T.unknown()
      replyAction = 'ai_fallback'
    }

    // ── Send reply ──────────────────────────────────────────────────────
    const { data: outMsg } = await supabaseAdmin.from('messages').insert({
      lead_id: lead.id, agent_id: agent.id, direction: 'outbound',
      content: reply, sent_by: 'bot',
    }).select('id').single()

    let waId: string | null = null
    if (incomingProvider === 'msg91') {
      const r = await sendWithRetry(() => sendViaMsg91(msg91IntegratedNumber, fromPhone, reply))
      waId = r.id
    }
    if (outMsg?.id && waId) {
      await supabaseAdmin.from('messages').update({ wa_message_id: waId }).eq('id', outMsg.id)
    }

    // Send photos if any
    for (const url of photos) {
      try {
        const mid = (await sendWithRetry(() => sendViaMsg91Media(msg91IntegratedNumber, fromPhone, url)))
        try { await supabaseAdmin.from('messages').insert({
          lead_id: lead.id, agent_id: agent.id, direction: 'outbound',
          content: '[photo]', sent_by: 'bot', wa_message_id: mid.id || null,
        }) } catch {}
      } catch {}
    }

    // Alert agent if needed (booking confirmed)
    if (shouldAlertAgent) {
      try {
        const { sendHighPriorityAlert } = await import('@/lib/alerts')
        await sendHighPriorityAlert(agent, {
          subject: `New booking: ${lead.name || lead.phone}`,
          html: `<p>A site visit has been booked for ${lead.name || lead.phone}.</p>`,
          whatsappText: `🔴 New booking confirmed!\n\n${lead.name || 'Lead'} (${lead.phone}) has booked a site visit.`,
          templateValues: [lead.name || 'Lead', lead.phone, 'booked a visit'],
          msg91IntegratedNumber,
        })
      } catch (e: any) { logError('alert_failed', { error: e?.message }) }
    }

    try { await supabaseAdmin.rpc('increment_messages_used', { p_agent_id: agent.id, p_amount: 2 }) } catch {}

    log('bot_reply', { action: replyAction, len: reply.length, photos: photos.length })
    return NextResponse.json({ status: 'ok', action: replyAction })

  } catch (err: any) {
    logError('webhook_error', { error: err.message })
    Sentry.captureException(err)
    return NextResponse.json({ status: 'error' }, { status: 500 })
  }
}