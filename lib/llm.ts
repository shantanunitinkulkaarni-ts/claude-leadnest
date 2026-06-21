import axios from 'axios'
import * as Sentry from '@sentry/nextjs'
import { cerebrasChat } from './cerebras'

// ─── Primary LLM: DeepSeek V4 Flash ─────────────────────────────────────────
export const DEEPSEEK_MODEL = 'deepseek-v4-flash'
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export function deepseekKey(): string | undefined {
  return process.env.DEEPSEEK_API_KEY
}

async function deepseekOnce(
  messages: ChatMessage[],
  opts: { maxTokens: number; temperature: number; timeoutMs: number }
): Promise<string> {
  const res = await axios.post(
    DEEPSEEK_URL,
    {
      model: DEEPSEEK_MODEL,
      messages,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
    },
    { headers: { Authorization: `Bearer ${deepseekKey()}`, 'Content-Type': 'application/json' }, timeout: opts.timeoutMs }
  )
  return (res.data?.choices?.[0]?.message?.content || '').trim()
}

// ─── Reliability scheduler (DeepSeek version) ────────────────────────────────
// Identical hedging logic from the GLM version. No behavior change.
// Attempts are retried with the same schedule and deadline logic.
const HEDGE_AFTER_MS = 3500       // an attempt this slow is probably stalling → add capacity
const ATTEMPT_TIMEOUT_MS = 12000  // kill a stalled attempt fast and retry fresh
const MAX_ATTEMPTS = 6            // hard cap on total calls (bounds cost)
const MAX_IN_FLIGHT = 2           // never hammer DeepSeek with more than 2 at once
const DEFAULT_DEADLINE_MS = 40000 // engine default; webhook/cron maxDuration is 60s

export type HedgeConfig = {
  deadlineMs: number       // overall budget — never resolves/rejects later than this
  attemptTimeoutMs: number // a single attempt is abandoned after this (replaced fresh)
  hedgeAfterMs: number     // if the newest attempt is this slow, add a parallel one
  maxAttempts: number      // total attempts cap (cost bound)
  maxInFlight: number      // concurrent attempts cap
}

// ─── Pure hedging scheduler (testable; `attempt` is injectable) ──────────────
// Identical to GLM version — no changes to retry/hedge logic.
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
      console.log(`DeepSeek ok: ${attempts} attempt(s) in ${Date.now() - startedAt}ms`)
      resolve(text)
    }

    const giveUp = (err: any) => {
      if (settled) return
      settled = true
      clearTimers()
      console.error(`DeepSeek gave up after ${attempts} attempt(s), ${Date.now() - startedAt}ms: ${err?.message || err}`)
      reject(err instanceof Error ? err : new Error(String(err ?? 'DeepSeek failed')))
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
          console.warn(`DeepSeek slow (>${cfg.hedgeAfterMs}ms) — launching parallel attempt`)
          launch()
        }
      }, cfg.hedgeAfterMs)
    }

    const onAttemptDone = () => {
      if (settled) return
      if (canLaunch()) { launch(); return }
      if (inFlight === 0) giveUp(lastError || new Error('DeepSeek: all attempts failed'))
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
          lastError = new Error('DeepSeek returned empty text')
          console.warn(`DeepSeek attempt ${myNum} returned empty`)
          onAttemptDone()
        })
        .catch(err => {
          if (attemptTimer) clearTimeout(attemptTimer)
          inFlight--
          lastError = err
          console.warn(`DeepSeek attempt ${myNum} failed: ${err?.response?.status || err?.message}`)
          onAttemptDone()
        })
    }

    deadlineTimer = setTimeout(
      () => giveUp(lastError || new Error(`DeepSeek overall deadline ${cfg.deadlineMs}ms exceeded`)),
      cfg.deadlineMs
    )

    launch()
  })
}

export function deepseekChat(
  messages: ChatMessage[],
  opts?: { maxTokens?: number; temperature?: number; deadlineMs?: number }
): Promise<string> {
  const maxTokens = opts?.maxTokens ?? 450
  const temperature = opts?.temperature ?? 0.7
  const deadlineMs = Math.max(5000, Math.min(opts?.deadlineMs ?? DEFAULT_DEADLINE_MS, 55000))
  if (!deepseekKey()) return Promise.reject(new Error('DEEPSEEK_API_KEY env var is missing'))

  return runWithHedging(
    () => deepseekOnce(messages, { maxTokens, temperature, timeoutMs: ATTEMPT_TIMEOUT_MS }),
    { deadlineMs, attemptTimeoutMs: ATTEMPT_TIMEOUT_MS, hedgeAfterMs: HEDGE_AFTER_MS, maxAttempts: MAX_ATTEMPTS, maxInFlight: MAX_IN_FLIGHT }
  )
}

// ─── Fallback chain: DeepSeek (hedged) → Cerebras (one shot) ──────────────────
// DeepSeek is now the primary. Cerebras is the fallback if all hedged attempts fail.
export async function callLLM(
  messages: ChatMessage[],
  opts?: { maxTokens?: number; temperature?: number; deadlineMs?: number },
  deps: { deepseek?: typeof deepseekChat; cerebras?: typeof cerebrasChat } = {}
): Promise<string> {
  const deepseek = deps.deepseek ?? deepseekChat
  const cerebras = deps.cerebras ?? cerebrasChat
  try {
    return await deepseek(messages, opts)
  } catch (err) {
    Sentry.captureException(err, { tags: { provider: 'deepseek', fallback: 'cerebras' } })
    return await cerebras(messages, { maxTokens: opts?.maxTokens, temperature: opts?.temperature })
  }
}
