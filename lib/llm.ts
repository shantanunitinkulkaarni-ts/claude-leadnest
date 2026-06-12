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

// Hedged request: free-tier latency is spiky — measured median ~2.3s but ~1 in
// 8 calls stalls for 12s+. A stalled request rarely recovers, so if the first
// call hasn't answered within HEDGE_AFTER_MS we fire a parallel duplicate and
// take whichever answers first. Typical cost: zero extra calls (the hedge only
// fires on slow ones); typical slow-case latency: ~6-7s instead of 12-28s.
const HEDGE_AFTER_MS = 3000
const ATTEMPT_TIMEOUT_MS = 20000

export function glmChat(
  messages: ChatMessage[],
  opts?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  const maxTokens = opts?.maxTokens ?? 450
  const temperature = opts?.temperature ?? 0.7
  if (!glmKey()) return Promise.reject(new Error('GLM_API_KEY env var is missing'))

  return new Promise<string>((resolve, reject) => {
    let settled = false
    let attempts = 0
    let failures = 0
    let hedgeLaunched = false

    const settleOk = (text: string) => {
      if (settled) return
      settled = true
      clearTimeout(hedgeTimer)
      resolve(text)
    }

    const launch = () => {
      attempts++
      glmOnce(messages, { maxTokens, temperature, timeoutMs: ATTEMPT_TIMEOUT_MS })
        .then(text => (text ? settleOk(text) : onFail(new Error('GLM returned empty text'))))
        .catch(onFail)
    }

    const onFail = (e: any) => {
      failures++
      if (settled) return
      console.warn('GLM attempt failed:', e?.response?.status || e?.message)
      if (!hedgeLaunched) {
        // First attempt died before the hedge timer — retry immediately.
        hedgeLaunched = true
        clearTimeout(hedgeTimer)
        launch()
        return
      }
      if (failures >= attempts) {
        settled = true
        reject(e)
      }
    }

    const hedgeTimer = setTimeout(() => {
      if (!settled && !hedgeLaunched) {
        hedgeLaunched = true
        console.warn(`GLM slow (> ${HEDGE_AFTER_MS}ms) — firing hedged duplicate request`)
        launch()
      }
    }, HEDGE_AFTER_MS)

    launch()
  })
}
