import { callLLM, type ChatMessage } from '../llm'
import {
  defaultIntent,
  parseExtractedIntent,
  type ExtractedIntent,
} from '../intentExtractor'

export type DecodedIncomingMessage = ExtractedIntent & {
  raw_message: string
}

const AI_DECODER_SYSTEM = `You are the AI decoder for TING, a real-estate WhatsApp assistant.
Your only job is to understand the customer's latest message and return structured data.

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
  "email": string | null
}

Important:
- "hi", "hello", "hey", "namaste", "namaskar" are greetings, not language choices.
- Only set language when the customer clearly asks for a language or writes meaningful content in that language.
- Assume INR for budgets unless the customer clearly says another currency.
- If the latest or previous assistant message asks about budget and the customer replies with a number, range, shorthand, or Indian amount, decode it into rupees.
- Examples: "20-30k" => budget_min 20000 and budget_max 30000; "30k" => budget_max 30000; "80 lakh" => budget_max 8000000; "1.2 cr" => budget_max 12000000.
- If the customer asks for photos, set message_type to "wants_photos".
- If the customer wants a site visit, set message_type to "booking_request".
- If the customer gives a date/time for a visit, put the raw Indian date/time phrase in visit_time_text.
- If the customer gives an email address, put it in email.
- If the customer says no preference for bedrooms or size, set bhk to "no_preference".
- Do not guess missing values.
- Do not write the customer reply.`

export async function aiDecoder(
  message: string,
  opts: {
    recent?: { role: 'user' | 'assistant'; content: string }[]
    known?: Partial<ExtractedIntent>
  } = {},
  deps: { llm?: typeof callLLM } = {},
): Promise<DecodedIncomingMessage> {
  const raw_message = message || ''
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
    const decoded = parseExtractedIntent(await llm(messages, {
      maxTokens: 220,
      temperature: 0,
      deadlineMs: 15000,
    }))
    return { ...normalizeNoPreference(raw_message, normalizePlainGreeting(raw_message, decoded)), raw_message }
  } catch {
    return { ...normalizeNoPreference(raw_message, normalizePlainGreeting(raw_message, defaultIntent())), raw_message }
  }
}

function normalizePlainGreeting(message: string, decoded: ExtractedIntent): ExtractedIntent {
  if (!isPlainGreeting(message)) return decoded
  return {
    ...decoded,
    name: null,
    intent: null,
    property_category: null,
    areas: [],
    bhk: null,
    budget_min: null,
    budget_max: null,
    message_type: 'greeting',
    visit_time_text: null,
    language: null,
    email: null,
  }
}

function isPlainGreeting(message: string): boolean {
  const text = (message || '').trim().toLowerCase().replace(/[!.?]+$/g, '')
  return /^(hi|hello|hey|hii+|heyy+|namaste|namaskar|\u0928\u092e\u0938\u094d\u0924\u0947|\u0928\u092e\u0938\u094d\u0915\u093e\u0930)$/.test(text)
}

function normalizeNoPreference(message: string, decoded: ExtractedIntent): ExtractedIntent {
  const text = (message || '').trim().toLowerCase().replace(/[!.?]+$/g, '')
  if (!/^(no\s*pref(?:erence)?|no\s*preference|any|anything|koi bhi)$/.test(text)) return decoded
  return {
    ...decoded,
    bhk: 'no_preference',
    message_type: decoded.message_type === 'other' ? 'qualifying_answer' : decoded.message_type,
  }
}

// The app decides the facts. The model only reshapes that brief into a tiny JSON
// envelope, and code extracts the reply text. If the model fails, the app draft
// is returned verbatim so the outbound message still stays safe and complete.
const AI_ENCODER_SYSTEM = `You are the reply writer for TING, a real-estate WhatsApp assistant.
Your only job is to turn the app's draft into one natural WhatsApp reply.

Return ONLY a JSON object with this shape:
{"reply": string}

Hard rules:
- Use ONLY what is in the brief. Never add or change any number, price, name, area, date, or promise.
- If something is not in the brief, do not mention it. Never invent.
- Reply in the requested language, matching how the customer writes.
- Keep it concise and human, like a helpful property agent.
- Do not echo the brief verbatim unless it already reads well.
- No prose. No markdown. JSON only.`

function extractJsonObject(raw: string): any | null {
  if (!raw) return null
  const trimmed = String(raw).trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '')
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try { return JSON.parse(trimmed.slice(start, end + 1)) } catch { return null }
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
    { role: 'user', content: `Language: ${language}\n${recent ? `Recent:\n${recent}\n` : ''}Brief (facts to convey - add nothing): ${draft}` },
  ]

  try {
    const raw = await llm(messages, { maxTokens: 180, temperature: 0, deadlineMs: 15000 })
    const decoded = extractJsonObject(raw)
    const reply = typeof decoded?.reply === 'string' ? decoded.reply.trim() : ''
    if (reply) return reply
  } catch {
    // fall back to the app-authored draft below
  }

  return draft
}
