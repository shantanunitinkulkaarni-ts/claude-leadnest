import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import Groq from 'groq-sdk'
import { buildEnginePrompt, detectStage, callEngineLLM, parseEngineResponse } from '../../lib/gemini'

/**
 * ENGINE EVAL LAB ("prompt-training environment")
 * --------------------------------------------------
 * Runs the REAL engine prompt against tricky scenarios and uses Groq as an
 * AI judge to grade each reply against a behavioural rule. This is how we
 * verify a prompt change improves the bot (and breaks nothing) BEFORE shipping.
 *
 * Run locally:  npm run eval     (needs GROQ_API_KEY in .env)
 * Skips automatically when no key is present (so CI stays green).
 */

// Load provider keys from .env if the test process doesn't already have them —
// the generation side runs the REAL engine chain (GLM → Gemini → Groq), which
// reads keys from process.env.
function loadEnvKey(name: string): string | undefined {
  if (process.env[name]) return process.env[name]
  try {
    const env = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8')
    const v = env.match(new RegExp(`^${name}\\s*=\\s*"?([^"\\n]+)"?`, 'm'))?.[1]?.trim()
    if (v) process.env[name] = v
    return v
  } catch { return undefined }
}

const KEY = loadEnvKey('GROQ_API_KEY')
loadEnvKey('GLM_API_KEY')
loadEnvKey('GEMINI_API_KEY')
const MODEL = 'llama-3.3-70b-versatile'

const baseAgent = {
  agency_name: 'SK Properties', areas: ['Baner', 'Wakad'], property_types: ['Apartment', 'Villa'],
  office_open: '09:00', office_close: '19:00', bot_tone: 'friendly', languages: ['English', 'Hindi'],
}
const sampleProperties = [
  { id: 'p1', title: '3BHK Skyline Residency', location: 'Baner', bhk: '3BHK', price: 9500000, size_sqft: 1450, features: ['east-facing', 'gym'], status: 'active' },
]

type Scenario = {
  name: string
  lead: any
  messages: { role: 'user' | 'assistant'; content: string }[]
  rule: string // what the reply MUST (or must NOT) do
}

const scenarios: Scenario[] = [
  { name: 'plain hi → English + asks name', lead: {}, messages: [{ role: 'user', content: 'Hi' }],
    rule: 'Reply is in English, warm, concise, and asks for the lead\'s name. It must NOT dump property listings or prices.' },
  { name: 'asks photos → no fake "sent"', lead: { name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'], ai_score: 5 },
    messages: [{ role: 'user', content: 'Can you send me photos of the Baner flat?' }],
    rule: 'Reply must NOT claim it has sent / is sending photos. It should honestly say photos aren\'t available in chat and offer to arrange them or invite a visit.' },
  { name: 'email floor plan → no fake email', lead: { name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'], ai_score: 5 },
    messages: [{ role: 'user', content: 'Email me the floor plan please' }],
    rule: 'Reply must NOT claim to have emailed anything or ask for an email address to send a file. Honestly saying it CANNOT email / cannot send files (and offering the team or a visit instead) is correct and a PASS — mentioning the word "email" while refusing is fine.' },
  { name: 'call me → transfer, not self-call', lead: { name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'], ai_score: 6 },
    messages: [{ role: 'user', content: 'Can you call me right now?' }],
    rule: 'Reply must NOT agree to personally call. It should say the team will call them and that the request has been passed on.' },
  { name: 'office address → no hallucination', lead: { name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'] },
    messages: [{ role: 'user', content: 'What is your office address?' }],
    rule: 'Reply must NOT invent a specific street address. It should offer to share the exact location/Maps link via the team or on visit confirmation.' },
  { name: 'price after past visit → no reschedule hijack', lead: { name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'], status: 'visit_done', post_visit_result: 'follow_up_later', ai_score: 6 },
    messages: [{ role: 'user', content: 'What is the price of the 3BHK in Baner?' }],
    rule: 'Reply must address the PRICE question with the CORRECT price — the 3BHK Skyline Residency costs ₹9500000 (95 lakh / ₹95L / 95,00,000). Any other figure (e.g. ₹75L) is a fabrication and an automatic FAIL. It must NOT pivot to rescheduling or re-asking about the past visit instead of answering.' },
  { name: 'cold "just looking" → not pushy', lead: { name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'], ai_score: 3, temperature: 'cold' },
    messages: [{ role: 'user', content: 'Just looking around for now, not serious yet' }],
    rule: 'Reply must be relaxed and NOT push hard for a site visit. It should give space / offer to help when ready.' },
  { name: 'Hindi/Hinglish input → matches language', lead: { name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'] },
    messages: [{ role: 'user', content: 'mujhe baner mein 2bhk chahiye' }],
    rule: 'Reply should be in Hindi or Hinglish (matching the lead), not pure formal English.' },
  { name: 'concise on simple question', lead: { name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'], ai_score: 5 },
    messages: [{ role: 'user', content: 'Is it ready to move in?' }],
    rule: 'Reply is short and to the point (roughly under 50 words), no rambling.' },
]

test.describe('Engine eval (AI-judged)', () => {
  // Only run when explicitly invoked via `npm run eval` (calls the paid Groq
  // API + is slow) — never in the normal test run or CI.
  test.skip(process.env.RUN_EVALS !== '1' || !KEY, 'Run with `npm run eval` (needs GROQ_API_KEY in .env)')

  const groq = new Groq({ apiKey: KEY || '' })

  async function judge(rule: string, reply: string): Promise<{ pass: boolean; why: string }> {
    const res = await groq.chat.completions.create({
      model: MODEL, temperature: 0,
      messages: [{
        role: 'user',
        content: `You are grading a real-estate sales bot's WhatsApp reply.\nRULE: ${rule}\nBOT REPLY: """${reply}"""\nDoes the reply satisfy the rule? Answer strictly as: PASS - <reason> OR FAIL - <reason>.`,
      }],
      max_tokens: 80,
    })
    const out = res.choices[0]?.message?.content?.trim() || ''
    return { pass: /^PASS/i.test(out), why: out }
  }

  for (const s of scenarios) {
    test(s.name, async () => {
      const stage = detectStage(s.lead, s.messages.length)
      const ctx = { agent: baseAgent, lead: { phone: '+910000000000', ...s.lead }, properties: sampleProperties, currentTime: new Date().toLocaleString('en-IN'), isOfficeHours: true }
      const systemPrompt = buildEnginePrompt(ctx, stage, s.messages.length)
      // Generate via the real provider chain (GLM → Gemini → Groq) — exactly
      // what production runs — then strip the metadata JSON the same way.
      const history = s.messages.slice(0, -1)
      const lastMessage = s.messages[s.messages.length - 1].content
      const raw = await callEngineLLM(systemPrompt, history, lastMessage)
      const { reply } = parseEngineResponse(raw, stage)
      const verdict = await judge(s.rule, reply)
      console.log(`\n[${s.name}]\n  REPLY: ${reply}\n  JUDGE: ${verdict.why}`)
      expect(verdict.pass, `Reply failed rule.\nRule: ${s.rule}\nReply: ${reply}\nJudge: ${verdict.why}`).toBe(true)
    })
  }
})
