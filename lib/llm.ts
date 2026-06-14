import axios from 'axios'

// ─── Single LLM provider: GLM-4.5-Flash (Z.ai, free tier) ────────────────────
// Founder decision (June 13): Gemini removed (key requires paid billing) and
// Groq removed (100k tokens/day free cap → mid-day outages = canned replies to
// real leads). GLM is the ONLY brain; reliability comes from a fast first
// attempt + one automatic retry with a longer budget, not from provider count.
//
// thinking disabled: GLM-4.5 is a reasoning model by default and would spend
// the whole token budget "thinking", returning empty text for chat use.

export const GLM_MODEL = 'glm-4.5-flash'
const GLM_URL = 'https://api.z.ai/api/paas/v4/chat/completions'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export function glmKey(): string | undefined {
  return process.env.GLM_API_KEY
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
      thinking: { type: 'disabled' },
    },
    { headers: { Authorization: `Bearer ${glmKey()}`, 'Content-Type': 'application/json' }, timeout: opts.timeoutMs }
  )
  return (res.data?.choices?.[0]?.message?.content || '').trim()
}

// ─── Reliability scheduler (interim, GLM-only) ───────────────────────────────
// Free-tier latency is bimodal: most calls answer in 2-4s, but a minority STALL
// for 12s+ and rarely recover. The old logic waited up to 20s on each of two
// attempts, so when both stalled it gave up at ~23s — wasting most of the
// webhook's 60s budget and handing the lead a canned fallback (observed live).
//
// New strategy: don't wait on a stall. Cap each attempt SHORT, run up to two in
// parallel, and keep launching FRESH attempts as ones fail/stall, until one
// answers or the overall deadline hits. A stalled call is killed at
// ATTEMPT_TIMEOUT_MS and immediately replaced — fresh calls usually return fast.
//
// Foolproof guarantees:
//  • settle-once (success OR give-up), all timers cleared on settle
//  • hard overall deadline → never exceeds the caller's budget (caller sets it
//    safely below its route maxDuration; engine ~40s of 60s, web chats ~18s of 30s)
//  • bounded cost: MAX_ATTEMPTS total, MAX_IN_FLIGHT concurrent
//  • late/duplicate resolutions after settle are ignored (no double-resolve, no
//    unhandled rejection)
const HEDGE_AFTER_MS = 3500       // an attempt this slow is probably stalling → add capacity
const ATTEMPT_TIMEOUT_MS = 12000  // kill a stalled attempt fast and retry fresh
const MAX_ATTEMPTS = 6            // hard cap on total calls (bounds cost)
const MAX_IN_FLIGHT = 2           // never hammer GLM with more than 2 at once
const DEFAULT_DEADLINE_MS = 40000 // engine default; webhook/cron maxDuration is 60s

export type HedgeConfig = {
  deadlineMs: number       // overall budget — never resolves/rejects later than this
  attemptTimeoutMs: number // a single attempt is abandoned after this (replaced fresh)
  hedgeAfterMs: number     // if the newest attempt is this slow, add a parallel one
  maxAttempts: number      // total attempts cap (cost bound)
  maxInFlight: number      // concurrent attempts cap
}

// ─── Pure hedging scheduler (testable; `attempt` is injectable) ──────────────
// Resolves with the first non-empty result from `attempt()`. Launches attempts,
// hedges a parallel one when the current is slow, replaces failed/stalled ones,
// and gives up cleanly at the deadline or attempt cap. The per-attempt timeout
// is enforced HERE (Promise.race) so behaviour does not depend on the network
// layer honouring its own timeout — and so it can be tested with fake attempts.
//
// Foolproof guarantees: settle-once; every timer cleared on settle; late or
// duplicate attempt results after settle are ignored (no double-settle, no
// unhandled rejection); bounded by maxAttempts AND deadline.
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
      console.log(`GLM ok: ${attempts} attempt(s) in ${Date.now() - startedAt}ms`)
      resolve(text)
    }

    const giveUp = (err: any) => {
      if (settled) return
      settled = true
      clearTimers()
      console.error(`GLM gave up after ${attempts} attempt(s), ${Date.now() - startedAt}ms: ${err?.message || err}`)
      reject(err instanceof Error ? err : new Error(String(err ?? 'GLM failed')))
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
          console.warn(`GLM slow (>${cfg.hedgeAfterMs}ms) — launching parallel attempt`)
          launch()
        }
      }, cfg.hedgeAfterMs)
    }

    const onAttemptDone = () => {
      if (settled) return
      // A slot just freed — replace the failed/stalled attempt right away.
      if (canLaunch()) { launch(); return }
      // Can't launch more (cap/deadline). If nothing is still running, we're out.
      if (inFlight === 0) giveUp(lastError || new Error('GLM: all attempts failed'))
      // else: an attempt is still in flight — let it finish (or the deadline fire).
    }

    const launch = () => {
      if (settled) return
      attempts++
      inFlight++
      const myNum = attempts
      let attemptTimer: ReturnType<typeof setTimeout> | null = null
      armHedge() // (re)start the slow-watch against this newest attempt

      // Race the attempt against its own timeout so a stalled call is abandoned
      // promptly (the underlying call keeps running but its result is ignored).
      const timeout = new Promise<never>((_, rej) => {
        attemptTimer = setTimeout(() => rej(new Error(`attempt timeout ${cfg.attemptTimeoutMs}ms`)), cfg.attemptTimeoutMs)
      })
      Promise.race([attempt(), timeout])
        .then(text => {
          if (attemptTimer) clearTimeout(attemptTimer)
          inFlight--
          if (text) { succeed(text); return }
          lastError = new Error('GLM returned empty text')
          console.warn(`GLM attempt ${myNum} returned empty`)
          onAttemptDone()
        })
        .catch(err => {
          if (attemptTimer) clearTimeout(attemptTimer)
          inFlight--
          lastError = err
          console.warn(`GLM attempt ${myNum} failed: ${err?.response?.status || err?.message}`)
          onAttemptDone()
        })
    }

    // Hard safety deadline — guarantees we return within budget even if every
    // attempt hangs, so the caller's own fallback can run well inside maxDuration.
    deadlineTimer = setTimeout(
      () => giveUp(lastError || new Error(`GLM overall deadline ${cfg.deadlineMs}ms exceeded`)),
      cfg.deadlineMs
    )

    launch()
  })
}

export function glmChat(
  messages: ChatMessage[],
  opts?: { maxTokens?: number; temperature?: number; deadlineMs?: number }
): Promise<string> {
  const maxTokens = opts?.maxTokens ?? 450
  const temperature = opts?.temperature ?? 0.7
  // Clamp the deadline so a stray caller can never blow past a serverless limit
  // (too-low would give up instantly; too-high would risk a function kill).
  const deadlineMs = Math.max(5000, Math.min(opts?.deadlineMs ?? DEFAULT_DEADLINE_MS, 55000))
  if (!glmKey()) return Promise.reject(new Error('GLM_API_KEY env var is missing'))

  return runWithHedging(
    () => glmOnce(messages, { maxTokens, temperature, timeoutMs: ATTEMPT_TIMEOUT_MS }),
    { deadlineMs, attemptTimeoutMs: ATTEMPT_TIMEOUT_MS, hedgeAfterMs: HEDGE_AFTER_MS, maxAttempts: MAX_ATTEMPTS, maxInFlight: MAX_IN_FLIGHT }
  )
}
