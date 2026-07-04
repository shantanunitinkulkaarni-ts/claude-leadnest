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
  "language": "english" | "hindi" | "marathi" | null
}

Important:
- "hi", "hello", "hey", "namaste", "namaskar" are greetings, not language choices.
- Only set language when the customer clearly asks for a language or writes meaningful content in that language.
- Assume INR for budgets unless the customer clearly says another currency.
- If the latest or previous assistant message asks about budget and the customer replies with a number, range, shorthand, or Indian amount, decode it into rupees.
- Examples: "20-30k" => budget_min 20000 and budget_max 30000; "30k" => budget_max 30000; "80 lakh" => budget_max 8000000; "1.2 cr" => budget_max 12000000.
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
    return { ...normalizePlainGreeting(raw_message, decoded), raw_message }
  } catch {
    return { ...normalizePlainGreeting(raw_message, defaultIntent()), raw_message }
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
  }
}

function isPlainGreeting(message: string): boolean {
  const text = (message || '').trim().toLowerCase().replace(/[!.?]+$/g, '')
  return /^(hi|hello|hey|hii+|heyy+|namaste|namaskar|नमस्ते|नमस्कार)$/.test(text)
}
