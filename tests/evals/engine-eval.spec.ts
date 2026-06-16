import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import Groq from 'groq-sdk'
import { buildEnginePrompt, detectStage, callEngineLLM, parseEngineResponse } from '../../lib/gemini'
import { baseAgent, sampleProperties, scenarios, slugify } from './scenarios'

/**
 * ENGINE EVAL LAB ("prompt-training environment")
 * --------------------------------------------------
 * Runs the REAL engine prompt against tricky scenarios and uses Groq as an
 * AI judge to grade each reply against a behavioural rule. This is how we
 * verify a prompt change improves the bot (and breaks nothing) BEFORE shipping.
 *
 * Run locally:  npm run eval     (needs GROQ_API_KEY in .env)
 * Skips automatically when no key is present (so CI stays green).
 *
 * Recording fixtures for CI (see engine-eval-replay.spec.ts):
 *   npm run eval:record
 * Writes tests/evals/fixtures/<scenario>.json (raw LLM output, parsed reply,
 * judge verdict). Commit the updated fixtures — CI replays them with zero
 * API calls instead of running this live spec.
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
loadEnvKey('CEREBRAS_API_KEY')
const MODEL = 'llama-3.3-70b-versatile'
const FIXTURES_DIR = path.join(process.cwd(), 'tests', 'evals', 'fixtures')
const RECORD = process.env.EVAL_RECORD === '1'

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

  if (RECORD) fs.mkdirSync(FIXTURES_DIR, { recursive: true })

  for (const s of scenarios) {
    test(s.name, async () => {
      const stage = detectStage(s.lead, s.messages.length)
      const lead = { phone: '+910000000000', ...s.lead }
      const lastMessage = s.messages[s.messages.length - 1].content
      const ctx = { agent: baseAgent, lead, properties: sampleProperties, currentTime: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), isOfficeHours: true, canSendPhotos: true, reschedulingLocked: false, detectedLang: null as string | null, incomingMessage: lastMessage }
      const systemPrompt = buildEnginePrompt(ctx, stage, s.messages.length)
      // Generate via the real provider chain (GLM → Cerebras fallback) — exactly
      // what production runs — then strip the metadata JSON the same way.
      const history = s.messages.slice(0, -1)
      const raw = await callEngineLLM(systemPrompt, history, lastMessage)
      const { reply } = parseEngineResponse(raw, stage)
      const verdict = await judge(s.rule, reply)
      console.log(`\n[${s.name}]\n  REPLY: ${reply}\n  JUDGE: ${verdict.why}`)

      if (RECORD) {
        const fixture = { name: s.name, rule: s.rule, stage, raw, reply, judgePass: verdict.pass, judgeWhy: verdict.why, recordedAt: new Date().toISOString() }
        fs.writeFileSync(path.join(FIXTURES_DIR, `${slugify(s.name)}.json`), JSON.stringify(fixture, null, 2) + '\n')
      }

      expect(verdict.pass, `Reply failed rule.\nRule: ${s.rule}\nReply: ${reply}\nJudge: ${verdict.why}`).toBe(true)
    })
  }
})
