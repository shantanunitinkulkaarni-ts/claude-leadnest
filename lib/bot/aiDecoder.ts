// lib/bot/aiDecoder.ts
// AI Mediator — Inbound (Decode) + Outbound (Encode)
//
// DECODER: The customer sends a message. It might be in any Indian language,
// Hinglish, misspelt, abbreviated, or using regional slang ("bnaer" = Baner,
// "book tom" = book tomorrow). The decoder's ONLY job is to understand what
// the customer means and return clean structured data the app can act on.
//
// ENCODER: Once the app has done its job (search, book, etc.), the encoder
// takes the app's draft and turns it into one neat WhatsApp reply in the
// customer's language. It never invents facts — only rephrases what the app
// gave it.
//
// Credit conservation:
//   - Pre-LLM fast paths for greetings, confirmations, cancellations, opt-outs,
//     photo requests, and no-preference replies (zero LLM cost).
//   - LLM is only called when the message is genuinely ambiguous.
//   - 10-second deadline, 220-token cap, temperature 0.

import { callLLM, type ChatMessage } from '../llm'
import {
  defaultIntent,
  parseExtractedIntent,
  type ExtractedIntent,
} from '../intentExtractor'

// ─── Types ───────────────────────────────────────────────────────────────────

export type DecodedIncomingMessage = ExtractedIntent & {
  raw_message: string
  // Size fields the flow controller needs but ExtractedIntent doesn't carry.
  sqft_preference?: number | null
  size_preference?: string | null
  no_size_preference?: boolean | null
  // Where the decode came from — useful for debugging and credit auditing.
  decode_source: 'regex' | 'llm' | 'llm-failed'
}

// ─── Pre-LLM Fast Paths (zero credit cost) ───────────────────────────────────
// These catch the most common simple messages so we never spend an LLM call
// on "hi", "yes", "cancel", "stop", "send photos", or "no preference".

const GREETING_RE = /^(hi+|hello+|hey+|hii+|heyy+|namaste|namaskar|namaskaram|pranam|pranaam|good\s+(morning|afternoon|evening|night)|\u0928\u092e\u0938\u094d\u0924\u0947|\u0928\u092e\u0938\u094d\u0915\u093e\u0930|\u092a\u094d\u0930\u0923\u093e\u092e|\u0906\u0926\u093e\u092c)(\s+sir|\s+madam)?[!\.\?]?\s*$/i

const CONFIRM_RE = /^(yes|yeah|yup|yep|sure|ok|okay|confirm|confirmed|acknowledged|done|theek\s+hain?|thik\s+hain?|haan|haan\s+ji|ji|bilkul|chalo|hoy|\u0939\u093e\u0901|\u0939\u093e\u0901\s+\u091c\u0940|\u091c\u0940|\u092c\u093f\u0932\u094d\u0915\u0941\u0932|\u091a\u0932\u094b|\u0939\u094b\u092f|\u092c\u0930\u0947|\u0920\u0940\u0915\s+\u0939\u0948\u0902?)[!\.\?]?\s*$/i

const CANCEL_RE = /^(please\s+)?cancel(\s+it)?(\s+my\s+visit)?(\s+booking)?[!\.\?]?\s*$/i

const OPTOUT_RE = /^(stop|unsubscribe|opt\s+out|unsub|stop\s+updates?|stop\s+msg|stop\s+messages|no\s+more\s+updates|\u0905\u092a\u0921\u0947\u091f\s+\u092c\u0902\u0926)[!\.\?]?\s*$/i

const NO_PREF_RE = /^(no\s*pref(?:erence)?|no\s+preference|any|anything|koi\s+bhi|kuch\s+bhi|doesn'?t\s+matter|don'?t\s+matter|jo\s+bhi|whatever|no\s+particular)[!\.\?]?\s*$/i

const WANTS_PHOTOS_RE = /\b(send|show|share|dekh|dikhao|bhej|bhejo|pathao)\b.*\b(photo|photos|pic|pics|image|images|tasveer|tasvir|\u092b\u091f\u094b|\u0924\u0938\u094d\u0935\u0940\u0930)\b/i

const WANTS_HUMAN_RE = /\b(call|phone|agent|human|person|talk\s+to|speak\s+to|connect\s+me|manager|owner|baat\s+karo|baat\s+karu|banda|insaan|agent\s+se|agent\s+ko)\b/i

const BOOKING_RE = /\b(visit|site\s+visit|book|booking|schedule|appointment|dekhna\s+chahta|dekhna\s+hai|visit\s+kar|ghoomna\s+hai|ghumna\s+hai)\b/i

/**
 * Try to decode the message without an LLM call. Returns null if the message
 * is genuinely ambiguous and needs the LLM.
 */
function tryFastPath(message: string): DecodedIncomingMessage | null {
  const raw = message || ''
  const text = raw.trim()

  if (!text) return null

  // Greeting — "hi", "hello", "namaste", "good morning"
  if (GREETING_RE.test(text)) {
    return { ...defaultIntent(), raw_message: raw, message_type: 'greeting', decode_source: 'regex' }
  }

  // Confirmation — "yes", "ok", "haan", "theek hai"
  if (CONFIRM_RE.test(text)) {
    return { ...defaultIntent(), raw_message: raw, message_type: 'qualifying_answer', decode_source: 'regex' }
  }

  // Cancel — "cancel", "cancel it", "cancel my visit"
  if (CANCEL_RE.test(text)) {
    return { ...defaultIntent(), raw_message: raw, message_type: 'booking_request', decode_source: 'regex' }
  }

  // Opt-out — "stop", "unsubscribe", "अपडेट बंद"
  if (OPTOUT_RE.test(text)) {
    return { ...defaultIntent(), raw_message: raw, message_type: 'other', decode_source: 'regex' }
  }

  // No preference — "any", "no preference", "koi bhi"
  if (NO_PREF_RE.test(text)) {
    return {
      ...defaultIntent(),
      raw_message: raw,
      message_type: 'qualifying_answer',
      bhk: 'no_preference',
      no_size_preference: true,
      decode_source: 'regex',
    }
  }

  // Wants photos — "send photos", "photos bhejo", "dikhao photos"
  if (WANTS_PHOTOS_RE.test(text)) {
    return { ...defaultIntent(), raw_message: raw, message_type: 'wants_photos', decode_source: 'regex' }
  }

  // Wants human — "call me", "talk to agent", "agent se baat"
  if (WANTS_HUMAN_RE.test(text) && text.length < 80) {
    return { ...defaultIntent(), raw_message: raw, message_type: 'wants_human', decode_source: 'regex' }
  }

  // Booking request — "book visit", "schedule appointment", "visit kar"
  if (BOOKING_RE.test(text) && text.length < 60) {
    // Don't fully decode here — let the LLM extract the time. But flag the type.
    // We return null so the LLM can also extract visit_time_text if present.
    // Only use this as a last-resort fast path if the message is very short.
    if (text.split(/\s+/).length <= 3) {
      return { ...defaultIntent(), raw_message: raw, message_type: 'booking_request', decode_source: 'regex' }
    }
  }

  return null // needs LLM
}

// ─── LLM Decoder ─────────────────────────────────────────────────────────────

const AI_DECODER_SYSTEM = `You are the AI decoder for TING, a real-estate WhatsApp assistant in India.

Your ONLY job: understand the customer's latest message and return structured data.
The customer may write in English, Hindi, Marathi, Hinglish, Tamil, Telugu, or any
Indian regional language. They may misspell, abbreviate, or use slang. You must
understand what they MEAN and return it in a form the app can use.

Return ONLY a JSON object. No prose. No markdown.

Fields:
{
  "name": string | null,
  "intent": "buy" | "rent" | null,
  "property_category": string | null,
  "areas": string[],
  "bhk": string | null,
  "budget_min": number | null,
  "budget_max": number | null,
  "message_type": "greeting" | "property_request" | "qualifying_answer" | "booking_request" | "wants_photos" | "wants_human" | "objection" | "other",
  "visit_time_text": string | null,
  "language": "english" | "hindi" | "marathi" | null,
  "email": string | null,
  "sqft_preference": number | null,
  "size_preference": string | null,
  "no_size_preference": boolean | null
}

Rules:
- "hi", "hello", "hey", "namaste", "namaskar" are greetings, NOT language choices.
- Only set "language" when the customer clearly asks for a language OR writes
  meaningful content in that language (not just a greeting).
- Assume INR for all budgets. Decode shorthand into rupees:
  "20-30k" => budget_min 20000, budget_max 30000
  "30k" => budget_max 30000
  "80 lakh" => budget_max 8000000
  "1.2 cr" => budget_max 12000000
- If the customer asks for photos, set message_type to "wants_photos".
- If the customer wants a site visit, set message_type to "booking_request".
- If the customer gives a date/time for a visit, put the RAW phrase in
  visit_time_text (e.g. "kal subah", "tomorrow 3pm", "day after tomorrow").
  Do NOT convert it to ISO — the app has a separate time parser for that.
- If the customer gives an email address, put it in "email".
- If the customer says no preference for bedrooms/size, set bhk to
  "no_preference" AND no_size_preference to true.
- If the customer mentions a specific sqft (e.g. "1200 sqft"), put it in
  sqft_preference as a number.
- Fix obvious misspellings in areas: "bnaer" → "Baner", "wadgaon" → "Wakad".
  Return the CORRECTED spelling in the areas array.
- Do NOT guess missing values. null means "not mentioned".
- Do NOT write the customer's reply. You only decode, never compose.`

export async function aiDecoder(
  message: string,
  opts: {
    recent?: { role: 'user' | 'assistant'; content: string }[]
    known?: Partial<ExtractedIntent>
  } = {},
  deps: { llm?: typeof callLLM } = {},
): Promise<DecodedIncomingMessage> {
  const raw_message = message || ''

  // Fast path — zero LLM cost for simple messages
  const fast = tryFastPath(raw_message)
  if (fast) return fast

  // LLM path — for genuinely ambiguous messages
  const llm = deps.llm || callLLM
  const recent = (opts.recent || [])
    .slice(-6)
    .map(m => `${m.role === 'user' ? 'customer' : 'assistant'}: ${m.content}`)
    .join('\n')
  const known = opts.known ? `Known so far: ${JSON.stringify(opts.known)}\n` : ''

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: AI_DECODER_SYSTEM },
      { role: 'user', content: `${known}${recent ? `Recent:\n${recent}\n` : ''}Latest message: "${raw_message}"` },
    ]
    const raw = await llm(messages, {
      maxTokens: 220,
      temperature: 0,
      deadlineMs: 10000,
    })
    const decoded = parseExtractedIntent(raw)
    // Extract size fields that parseExtractedIntent doesn't handle
    const extra = extractSizeFields(raw)
    return {
      ...decoded,
      ...extra,
      raw_message,
      decode_source: 'llm',
    }
  } catch {
    return { ...defaultIntent(), raw_message, decode_source: 'llm-failed' }
  }
}

/** Extract sqft_preference, size_preference, no_size_preference from raw LLM JSON. */
function extractSizeFields(raw: string): {
  sqft_preference?: number | null
  size_preference?: string | null
  no_size_preference?: boolean | null
} {
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return {}
    const obj = JSON.parse(match[0])
    const out: any = {}
    if (typeof obj.sqft_preference === 'number' && obj.sqft_preference > 0) {
      out.sqft_preference = Math.round(obj.sqft_preference)
    }
    if (typeof obj.size_preference === 'string' && obj.size_preference.trim()) {
      out.size_preference = obj.size_preference.trim()
    }
    if (obj.no_size_preference === true) {
      out.no_size_preference = true
    }
    return out
  } catch {
    return {}
  }
}

// ─── AI Encoder (Outbound) ───────────────────────────────────────────────────
//
// Takes the app's draft reply and turns it into one natural WhatsApp message
// in the customer's language. NEVER invents facts — only rephrases.

const AI_ENCODER_SYSTEM = `You are the reply writer for TING, a real-estate WhatsApp assistant.

Your ONLY job: turn the app's draft into one natural WhatsApp reply in the
customer's language. The app has already decided what to say — you just make
it sound human.

Return ONLY a JSON object: {"reply": string}

Hard rules:
- Use ONLY what is in the brief. Never add or change any number, price, name,
  area, date, or promise.
- If something is not in the brief, do NOT mention it. Never invent.
- Reply in the requested language, matching how the customer writes.
  If the language is Hindi, write in Hindi (Devanagari or Hinglish as the
  customer uses). If Marathi, write in Marathi. If English, write in English.
- Keep it concise and human — like a helpful property agent on WhatsApp.
- Do NOT echo the brief verbatim unless it already reads well.
- No prose. No markdown. JSON only.`

function extractReplyJson(raw: string): string | null {
  if (!raw) return null
  const trimmed = String(raw).trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '')
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const obj = JSON.parse(trimmed.slice(start, end + 1))
    return typeof obj.reply === 'string' ? obj.reply.trim() : null
  } catch {
    return null
  }
}

export async function aiComposeReply(
  brief: string,
  opts: {
    language?: string | null
    recent?: { role: 'user' | 'assistant'; content: string }[]
  } = {},
  deps: { llm?: typeof callLLM } = {},
): Promise<string> {
  const draft = (brief || '').trim()
  if (!draft) return ''

  const llm = deps.llm || callLLM
  const language = opts.language || 'english'
  const recent = (opts.recent || [])
    .slice(-4)
    .map(m => `${m.role === 'user' ? 'customer' : 'assistant'}: ${m.content}`)
    .join('\n')

  const messages: ChatMessage[] = [
    { role: 'system', content: AI_ENCODER_SYSTEM },
    { role: 'user', content: `Language: ${language}\n${recent ? `Recent:\n${recent}\n` : ''}Brief (facts to convey — add nothing): ${draft}` },
  ]

  try {
    const raw = await llm(messages, { maxTokens: 180, temperature: 0, deadlineMs: 10000 })
    const reply = extractReplyJson(raw)
    if (reply) return reply
  } catch {
    // fall back to the app-authored draft
  }

  return draft
}