// ─────────────────────────────────────────────────────────────────────────────
// INTENT EXTRACTOR  (the AI's ONLY job — decode the human into structured data)
// ─────────────────────────────────────────────────────────────────────────────
// The AI reads a (possibly Marathi/Hindi/Hinglish, misspelt, ambiguous) message
// and returns STRUCTURED facts: what the customer wants. It NEVER returns prose
// the customer sees and NEVER quotes a property fact. Code then acts on this.
// See memory bot-architecture-ai-decodes-code-acts.
//
// Reliability comes from validation: whatever the model returns is coerced into
// a known shape, with safe defaults. A bad/garbled model output degrades to
// message_type:'other' (→ the orchestrator asks a clarifying question), never to
// a fabricated property. parseExtractedIntent is pure + heavily unit-tested; the
// model call is a thin wrapper.

import { callLLM, type ChatMessage } from './llm'
import { parseBudgetRupees } from './budgetParse'

export type MessageType =
  | 'greeting' | 'property_request' | 'qualifying_answer' | 'booking_request'
  | 'wants_photos' | 'wants_human' | 'objection' | 'other'

export type ExtractedIntent = {
  name: string | null
  intent: 'buy' | 'rent' | null
  property_category: string | null
  areas: string[]
  bhk: string | null
  budget_min: number | null
  budget_max: number | null
  message_type: MessageType
  visit_time_text: string | null
  language: 'english' | 'hindi' | 'marathi' | null
}

const MESSAGE_TYPES: MessageType[] = [
  'greeting', 'property_request', 'qualifying_answer', 'booking_request',
  'wants_photos', 'wants_human', 'objection', 'other',
]

export function defaultIntent(): ExtractedIntent {
  return {
    name: null, intent: null, property_category: null, areas: [], bhk: null,
    budget_min: null, budget_max: null, message_type: 'other',
    visit_time_text: null, language: null,
  }
}

// Pull the first {...} JSON object out of the model's text (handles code fences
// and stray prose around it). Returns the parsed object or null.
function extractJsonObject(raw: string): any | null {
  if (!raw) return null
  let s = String(raw).trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '')
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try { return JSON.parse(s.slice(start, end + 1)) } catch { return null }
}

function asString(v: any): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t && t.toLowerCase() !== 'null' && t.toLowerCase() !== 'none' ? t : null
}

function normalizeBhk(v: any): string | null {
  const s = asString(v)
  if (!s) return null
  const m = /(\d+(?:\.\d+)?)\s*(?:bhk|rk|bed)?/i.exec(s)
  if (m) return `${m[1]}BHK`
  return s.slice(0, 20)
}

// Budget text → rupees. Handles lakh/crore (via parseBudgetRupees), plus the
// rental forms parseBudgetRupees doesn't: "20k", "₹20,000", a bare "18000".
export function parseBudgetText(v: any): number | null {
  if (typeof v === 'number') return v > 0 ? Math.round(v) : null
  const s = asString(v)
  if (!s) return null
  const viaUnit = parseBudgetRupees(s)
  if (viaUnit) return viaUnit
  const clean = s.replace(/[,₹\s]/g, '')
  const km = /^(\d+(?:\.\d+)?)k$/i.exec(clean)
  if (km) return Math.round(parseFloat(km[1]) * 1000)
  const plain = /^(\d{4,9})$/.exec(clean)
  if (plain) return parseInt(plain[1], 10)
  return null
}

function normalizeLanguage(v: any): ExtractedIntent['language'] {
  const s = (asString(v) || '').toLowerCase()
  if (s.startsWith('hin')) return 'hindi'
  if (s.startsWith('mar')) return 'marathi'
  if (s.startsWith('eng')) return 'english'
  return null
}

// Turn the model's structured output into a validated ExtractedIntent. Pure.
export function parseExtractedIntent(raw: string): ExtractedIntent {
  const obj = extractJsonObject(raw)
  if (!obj || typeof obj !== 'object') return defaultIntent()

  const intent = obj.intent === 'buy' || obj.intent === 'rent' ? obj.intent : null

  const areas: string[] = Array.isArray(obj.areas)
    ? obj.areas.filter((x: any) => typeof x === 'string' && x.trim()).map((x: string) => x.trim()).slice(0, 5)
    : (asString(obj.areas) ? [asString(obj.areas)!] : [])

  // Budget can come as clean INR min/max numbers, or as older text like "50 lakh".
  const budget_max = parseBudgetText(obj.budget_max ?? obj.budget ?? null)
  const budget_min = parseBudgetText(obj.budget_min ?? null)

  const message_type: MessageType = MESSAGE_TYPES.includes(obj.message_type) ? obj.message_type : 'other'

  return {
    name: asString(obj.name),
    intent,
    property_category: asString(obj.property_category),
    areas,
    bhk: normalizeBhk(obj.bhk),
    budget_min,
    budget_max,
    message_type,
    visit_time_text: asString(obj.visit_time_text),
    language: normalizeLanguage(obj.language),
  }
}

const SYSTEM = `You are an information extractor for a real-estate WhatsApp assistant in India.
Read the customer's latest message (with the recent context) and output ONLY a JSON object — no prose, no markdown — describing what they want. Decode Hindi, Marathi, Hinglish and spelling mistakes. Use null when something is unknown; never guess a value.

JSON shape:
{
  "intent": "buy" | "rent" | null,
  "name": string | null,
  "property_category": string | null,
  "areas": string[],
  "bhk": string | null,
  "budget": string | null,
  "message_type": "greeting" | "property_request" | "qualifying_answer" | "booking_request" | "wants_photos" | "wants_human" | "objection" | "other",
  "visit_time_text": string | null,
  "language": "english" | "hindi" | "marathi" | null
}
Rules: "budget" = exactly as the customer expressed it ("50 lakh", "20k", "1.2 cr"). "areas" = localities mentioned. "visit_time_text" = the raw time phrase only if they want to visit. Output JSON only.`

// Run the model to decode one message into structured intent. `known` is the
// criteria we already have on the lead (so the model can focus on what's new).
export async function extractIntent(
  message: string,
  opts: { recent?: { role: 'user' | 'assistant'; content: string }[]; known?: Partial<ExtractedIntent> } = {},
  deps: { llm?: typeof callLLM } = {},
): Promise<ExtractedIntent> {
  const llm = deps.llm ?? callLLM
  const recent = (opts.recent || []).slice(-6).map(m => `${m.role === 'user' ? 'customer' : 'assistant'}: ${m.content}`).join('\n')
  const known = opts.known ? `Currently known: ${JSON.stringify(opts.known)}\n` : ''
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `${known}${recent ? `Recent:\n${recent}\n` : ''}Customer's latest message: "${message}"\nOutput JSON only.` },
  ]
  try {
    const raw = await llm(messages, { maxTokens: 220, temperature: 0, deadlineMs: 15000 })
    return parseExtractedIntent(raw)
  } catch {
    return defaultIntent() // safe failure → orchestrator asks a clarifying question
  }
}
