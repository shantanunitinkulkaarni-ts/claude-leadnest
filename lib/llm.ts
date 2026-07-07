import axios from 'axios'
import * as Sentry from '@sentry/nextjs'

// ─── Primary LLM: Groq (llama-3.3-70b) ───────────────────────────────────────
// Groq is the primary brain — fast, generous free limits. Reliability comes from
// a fast first attempt + auto-retry (hedging below). If Groq exhausts every
// attempt, callLLM() falls back to GLM-4.5-Flash (Z.ai) for one shot.
// DeepSeek was removed (account balance hit zero) and Cerebras (5 req/min) is no
// longer in the live path — its low rate limit can't carry real traffic.
export const GROQ_MODEL = 'llama-3.3-70b-versatile'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

// ─── Fallback LLM: GLM-4.5-Flash (Z.ai) ──────────────────────────────────────
export const GLM_MODEL = 'glm-4.5-flash'
const GLM_URL = 'https://api.z.ai/api/paas/v4/chat/completions'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export function groqKey(): string | undefined {
  return process.env.GROQ_API_KEY
}
export function glmKey(): string | undefined {
  return process.env.GLM_API_KEY
}

async function groqOnce(
  messages: ChatMessage[],
  opts: { maxTokens: number; temperature: number; timeoutMs: number }
): Promise<string> {
  const res = await axios.post(
    GROQ_URL,
    {
      model: GROQ_MODEL,
      messages,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
    },
    { headers: { Authorization: `Bearer ${groqKey()}`, 'Content-Type': 'application/json' }, timeout: opts.timeoutMs }
  )
  return (res.data?.choices?.[0]?.message?.content || '').trim()
}

async function glmOnce(
  messages: ChatMessage[],
  opts: { maxTokens: number; temperature: number; timeoutMs: number }
): Promise<string> {
  const res = await axios.post(
    GLM_URL,
    {
      model: GLM_MODEL,
      messages,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      thinking: { type: 'disabled' }, // GLM-4.5 reasons by default — disable to save latency/tokens
    },
    { headers: { Authorization: `Bearer ${glmKey()}`, 'Content-Type': 'application/json' }, timeout: opts.timeoutMs }
  )
  return (res.data?.choices?.[0]?.message?.content || '').trim()
}

// ─── Reliability scheduler ───────────────────────────────────────────────────
// Fast first attempt; if it stalls, launch a parallel hedge; abandon slow
// attempts and retry fresh; bounded by a total deadline and attempt cap.
const HEDGE_AFTER_MS = 3500       // an attempt this slow is probably stalling → add capacity
const ATTEMPT_TIMEOUT_MS = 12000  // kill a stalled attempt fast and retry fresh
const MAX_ATTEMPTS = 6            // hard cap on total calls (bounds cost)
const MAX_IN_FLIGHT = 2           // never hammer the provider with more than 2 at once
const DEFAULT_DEADLINE_MS = 40000 // engine default; webhook/cron maxDuration is 60s

export type HedgeConfig = {
  deadlineMs: number       // overall budget — never resolves/rejects later than this
  attemptTimeoutMs: number // a single attempt is abandoned after this (replaced fresh)
  hedgeAfterMs: number     // if the newest attempt is this slow, add a parallel one
  maxAttempts: number      // total attempts cap (cost bound)
  maxInFlight: number      // concurrent attempts cap
}

// ─── Pure hedging scheduler (testable; `attempt` is injectable) ──────────────
export function runWithHedging(attempt: () => Promise<string>, cfg: HedgeConfig): Promise<string> {
  const startedAt = Date.now()

  return new Promise<string>((resolve, reject) => {
    let settled = false
    let attempts = 0          // total launched
    let inFlight = 0          // currently running
    let lastError: any = null
    let hedgeTimer: ReturnType<typeof setTimeout> | null = null
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null

    const clearTimers = () => {
      if (hedgeTimer) { clearTimeout(hedgeTimer); hedgeTimer = null }
      if (deadlineTimer) { clearTimeout(deadlineTimer); deadlineTimer = null }
    }

    const succeed = (text: string) => {
      if (settled) return
      settled = true
      clearTimers()
      console.log(`Groq ok: ${attempts} attempt(s) in ${Date.now() - startedAt}ms`)
      resolve(text)
    }

    const giveUp = (err: any) => {
      if (settled) return
      settled = true
      clearTimers()
      console.error(`Groq gave up after ${attempts} attempt(s), ${Date.now() - startedAt}ms: ${err?.message || err}`)
      reject(err instanceof Error ? err : new Error(String(err ?? 'Groq failed')))
    }

    const canLaunch = () =>
      !settled &&
      attempts < cfg.maxAttempts &&
      inFlight < cfg.maxInFlight &&
      (Date.now() - startedAt) < cfg.deadlineMs

    const armHedge = () => {
      if (hedgeTimer) clearTimeout(hedgeTimer)
      hedgeTimer = setTimeout(() => {
        if (canLaunch()) {
          console.warn(`Groq slow (>${cfg.hedgeAfterMs}ms) — launching parallel attempt`)
          launch()
        }
      }, cfg.hedgeAfterMs)
    }

    const onAttemptDone = () => {
      if (settled) return
      if (canLaunch()) { launch(); return }
      if (inFlight === 0) giveUp(lastError || new Error('Groq: all attempts failed'))
    }

    const launch = () => {
      if (settled) return
      attempts++
      inFlight++
      const myNum = attempts
      let attemptTimer: ReturnType<typeof setTimeout> | null = null
      armHedge()

      const timeout = new Promise<never>((_, rej) => {
        attemptTimer = setTimeout(() => rej(new Error(`attempt timeout ${cfg.attemptTimeoutMs}ms`)), cfg.attemptTimeoutMs)
      })
      Promise.race([attempt(), timeout])
        .then(text => {
          if (attemptTimer) clearTimeout(attemptTimer)
          inFlight--
          if (text) { succeed(text); return }
          lastError = new Error('Groq returned empty text')
          console.warn(`Groq attempt ${myNum} returned empty`)
          onAttemptDone()
        })
        .catch(err => {
          if (attemptTimer) clearTimeout(attemptTimer)
          inFlight--
          lastError = err
          console.warn(`Groq attempt ${myNum} failed: ${err?.response?.status || err?.message}`)
          onAttemptDone()
        })
    }

    deadlineTimer = setTimeout(
      () => giveUp(lastError || new Error(`Groq overall deadline ${cfg.deadlineMs}ms exceeded`)),
      cfg.deadlineMs
    )

    launch()
  })
}

export function groqChat(
  messages: ChatMessage[],
  opts?: { maxTokens?: number; temperature?: number; deadlineMs?: number }
): Promise<string> {
  const maxTokens = opts?.maxTokens ?? 450
  const temperature = opts?.temperature ?? 0.7
  const deadlineMs = Math.max(5000, Math.min(opts?.deadlineMs ?? DEFAULT_DEADLINE_MS, 55000))
  if (!groqKey()) return Promise.reject(new Error('GROQ_API_KEY env var is missing'))

  return runWithHedging(
    () => groqOnce(messages, { maxTokens, temperature, timeoutMs: ATTEMPT_TIMEOUT_MS }),
    { deadlineMs, attemptTimeoutMs: ATTEMPT_TIMEOUT_MS, hedgeAfterMs: HEDGE_AFTER_MS, maxAttempts: MAX_ATTEMPTS, maxInFlight: MAX_IN_FLIGHT }
  )
}

// GLM fallback — a single shot (no hedging); used only when Groq is exhausted.
export function glmChat(
  messages: ChatMessage[],
  opts?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  const maxTokens = opts?.maxTokens ?? 450
  const temperature = opts?.temperature ?? 0.7
  if (!glmKey()) return Promise.reject(new Error('GLM_API_KEY env var is missing'))
  return glmOnce(messages, { maxTokens, temperature, timeoutMs: ATTEMPT_TIMEOUT_MS })
}

// ─── Fallback chain: Groq (hedged) → GLM (one shot) ──────────────────────────
const TEST_MODE_MOCKS: Record<string, string> = {
  'Hi': '{"name":null,"intent":null,"property_category":null,"areas":[],"bhk":null,"budget_min":null,"budget_max":null,"message_type":"greeting","visit_time_text":null,"language":null,"email":null}',
  'I want to buy a 2 BHK in Baner': '{"name":null,"intent":"buy","property_category":null,"areas":["Baner"],"bhk":"2BHK","budget_min":null,"budget_max":null,"message_type":"property_request","visit_time_text":null,"language":null,"email":null}',
  'My budget is around 90 lakh': '{"name":null,"intent":"buy","property_category":null,"areas":["Baner"],"bhk":"2BHK","budget_min":null,"budget_max":9000000,"message_type":"qualifying_answer","visit_time_text":null,"language":null,"email":null}',
  'Yes I would like to visit': '{"name":null,"intent":"buy","property_category":null,"areas":["Baner"],"bhk":"2BHK","budget_min":null,"budget_max":9000000,"message_type":"booking_request","visit_time_text":null,"language":null,"email":null}',
  'Sunday 11 AM': '{"name":null,"intent":"buy","property_category":null,"areas":["Baner"],"bhk":"2BHK","budget_min":null,"budget_max":9000000,"message_type":"booking_request","visit_time_text":"Sunday 11 AM","language":null,"email":null}',
  'shantanunitinkulkaarni@gmail.com': '{"name":null,"intent":"buy","property_category":null,"areas":["Baner"],"bhk":"2BHK","budget_min":null,"budget_max":9000000,"message_type":"booking_request","visit_time_text":"Sunday 11 AM","language":null,"email":"shantanunitinkulkaarni@gmail.com"}',
  // Decision responses (for bot logic)
  'greeting': '{"stage":"name","reply":"Hi there! What is your name?","action":null,"updates":{}}',
  'property_request': '{"stage":"qualifying","reply":"Got it - you want a 2BHK in Baner. What is your budget?","action":"search_properties","updates":{"intent":"buy","preferred_areas":["Baner"],"property_category":"2BHK"}}',
  'qualifying_answer with budget': '{"stage":"search_results","reply":"Perfect! I found a 2BHK flat in Baner priced at Rs 85,00,000 within your budget. Would you like to schedule a site visit?","action":"search_properties","updates":{"budget_max":9000000}}',
  'booking_request': '{"stage":"awaiting_visit_time","reply":"Great! What date and time work best for you?","action":null,"updates":{}}',
  'awaiting_visit_time': '{"stage":"awaiting_email","reply":"Thanks! What email should I send the confirmation to?","action":null,"updates":{"pending_appointment_time":"2026-07-07T11:00:00Z"}}',
  'awaiting_email': '{"stage":"visit_confirmed","reply":"Perfect! Your site visit is confirmed for Sunday at 11 AM. We will send a confirmation to your email.","action":"book_visit","updates":{"email":"shantanunitinkulkaarni@gmail.com"}}'
}

export async function callLLM(
  messages: ChatMessage[],
  opts?: { maxTokens?: number; temperature?: number; deadlineMs?: number },
  deps: { groq?: typeof groqChat; glm?: typeof glmChat } = {}
): Promise<string> {
  if (process.env.TEST_MODE_LLM === 'true') {
    const systemMsg = messages.find(m => m.role === 'system')?.content || ''
    const userMsg = messages.find(m => m.role === 'user')?.content || ''

    // Determine if this is a decoder or decision call
    const isDecoder = systemMsg.includes('AI decoder for TING')
    const isComposer = systemMsg.includes('reply writer for TING')

    if (isDecoder) {
      // Decoder: match on message type
      if (userMsg.includes('Hi')) return TEST_MODE_MOCKS['Hi']
      if (userMsg.includes('I want to buy a 2 BHK in Baner')) return TEST_MODE_MOCKS['I want to buy a 2 BHK in Baner']
      if (userMsg.includes('My budget is around 90 lakh')) return TEST_MODE_MOCKS['My budget is around 90 lakh']
      if (userMsg.includes('Yes I would like to visit')) return TEST_MODE_MOCKS['Yes I would like to visit']
      if (userMsg.includes('Sunday 11 AM')) return TEST_MODE_MOCKS['Sunday 11 AM']
      if (userMsg.includes('shantanunitinkulkaarni@gmail.com')) return TEST_MODE_MOCKS['shantanunitinkulkaarni@gmail.com']
      return '{"name":null,"intent":null,"property_category":null,"areas":[],"bhk":null,"budget_min":null,"budget_max":null,"message_type":"other","visit_time_text":null,"language":null,"email":null}'
    }

    if (isComposer) {
      // Composer: wrap the brief in the same tiny JSON envelope the live path expects.
      const briefMatch = userMsg.match(/Brief \(facts to convey[^:]*\): (.+)$/m)
      const reply = briefMatch ? briefMatch[1] : userMsg
      return JSON.stringify({ reply })
    }

    // Decision: match based on message_type from last decoder
    if (userMsg.includes('message_type":"greeting')) return TEST_MODE_MOCKS['greeting']
    if (userMsg.includes('message_type":"property_request')) return TEST_MODE_MOCKS['property_request']
    if (userMsg.includes('message_type":"qualifying_answer')) return TEST_MODE_MOCKS['qualifying_answer with budget']
    if (userMsg.includes('message_type":"booking_request') && userMsg.includes('visit_time_text')) return TEST_MODE_MOCKS['awaiting_email']
    if (userMsg.includes('message_type":"booking_request')) return TEST_MODE_MOCKS['booking_request']
    if (userMsg.includes('stage":"awaiting_visit_time')) return TEST_MODE_MOCKS['awaiting_visit_time']
    if (userMsg.includes('stage":"awaiting_email')) return TEST_MODE_MOCKS['awaiting_email']

    return '{"stage":"other","reply":"How can I help?","action":null,"updates":{}}'
  }

  const groq = deps.groq ?? groqChat
  const glm = deps.glm ?? glmChat
  try {
    return await groq(messages, opts)
  } catch (err) {
    Sentry.captureException(err, { tags: { provider: 'groq', fallback: 'glm' } })
    return await glm(messages, { maxTokens: opts?.maxTokens, temperature: opts?.temperature })
  }
}
