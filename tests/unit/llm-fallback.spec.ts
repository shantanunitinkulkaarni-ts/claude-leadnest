import { test, expect } from '@playwright/test'
import { callLLM } from '../../lib/llm'

const msgs = [{ role: 'user' as const, content: 'hello' }]

test.describe('callLLM — Groq primary, GLM fallback', () => {
  test('returns Groq result without touching GLM when Groq succeeds', async () => {
    let glmCalls = 0
    const out = await callLLM(msgs, undefined, {
      groq: async () => 'groq-reply',
      glm: async () => { glmCalls++; return 'glm-reply' },
    })
    expect(out).toBe('groq-reply')
    expect(glmCalls).toBe(0)
  })

  test('falls back to GLM when Groq throws', async () => {
    const out = await callLLM(msgs, undefined, {
      groq: async () => { throw new Error('Groq exhausted all attempts') },
      glm: async () => 'glm-reply',
    })
    expect(out).toBe('glm-reply')
  })

  test('propagates the GLM error when both providers fail', async () => {
    let error: Error | null = null
    await callLLM(msgs, undefined, {
      groq: async () => { throw new Error('Groq down') },
      glm: async () => { throw new Error('GLM down') },
    }).catch(e => { error = e })
    expect(error).not.toBeNull()
    expect(error!.message).toBe('GLM down')
  })

  test('passes maxTokens/temperature through to the fallback call', async () => {
    let receivedOpts: any = null
    await callLLM(msgs, { maxTokens: 300, temperature: 0.4 }, {
      groq: async () => { throw new Error('Groq down') },
      glm: async (_messages, opts) => { receivedOpts = opts; return 'ok' },
    })
    expect(receivedOpts).toEqual({ maxTokens: 300, temperature: 0.4 })
  })
})
