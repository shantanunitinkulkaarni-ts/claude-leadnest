import axios from 'axios'
import type { ChatMessage } from './llm'

// ─── Fallback LLM: Cerebras (one-shot, no hedging) ────────────────────────────
// Used ONLY when GLM (primary) fails its own hedged attempts — see callLLM in
// lib/llm.ts. Cerebras's free tier has a low requests-per-minute cap, so this
// is deliberately a single attempt, not a hedged/retried scheduler like GLM's:
// hammering it with parallel retries would burn the per-minute budget for no
// benefit. If this one attempt also fails, the caller's canned reply is the
// last resort — same as before this fallback existed.
const CEREBRAS_URL = 'https://api.cerebras.ai/v1/chat/completions'
export const CEREBRAS_MODEL = 'llama-3.3-70b'

export function cerebrasKey(): string | undefined {
  return process.env.CEREBRAS_API_KEY
}

export async function cerebrasChat(
  messages: ChatMessage[],
  opts?: { maxTokens?: number; temperature?: number; timeoutMs?: number }
): Promise<string> {
  if (!cerebrasKey()) throw new Error('CEREBRAS_API_KEY env var is missing')
  const res = await axios.post(
    CEREBRAS_URL,
    {
      model: CEREBRAS_MODEL,
      messages,
      max_tokens: opts?.maxTokens ?? 450,
      temperature: opts?.temperature ?? 0.7,
    },
    {
      headers: { Authorization: `Bearer ${cerebrasKey()}`, 'Content-Type': 'application/json' },
      timeout: opts?.timeoutMs ?? 15000,
    }
  )
  return (res.data?.choices?.[0]?.message?.content || '').trim()
}
