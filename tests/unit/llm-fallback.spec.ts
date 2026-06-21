import { test, expect } from '@playwright/test'
import { callLLM } from '../../lib/llm'

const msgs = [{ role: 'user' as const, content: 'hello' }]

test.describe('callLLM — DeepSeek primary, Cerebras fallback', () => {
  test('returns DeepSeek result without touching Cerebras when DeepSeek succeeds', async () => {
    let cerebrasCalls = 0
    const out = await callLLM(msgs, undefined, {
      deepseek: async () => 'deepseek-reply',
      cerebras: async () => { cerebrasCalls++; return 'cerebras-reply' },
    })
    expect(out).toBe('deepseek-reply')
    expect(cerebrasCalls).toBe(0)
  })

  test('falls back to Cerebras when DeepSeek throws', async () => {
    const out = await callLLM(msgs, undefined, {
      deepseek: async () => { throw new Error('DeepSeek exhausted all attempts') },
      cerebras: async () => 'cerebras-reply',
    })
    expect(out).toBe('cerebras-reply')
  })

  test('propagates the Cerebras error when both providers fail', async () => {
    let error: Error | null = null
    await callLLM(msgs, undefined, {
      deepseek: async () => { throw new Error('DeepSeek down') },
      cerebras: async () => { throw new Error('Cerebras down') },
    }).catch(e => { error = e })
    expect(error).not.toBeNull()
    expect(error!.message).toBe('Cerebras down')
  })

  test('passes maxTokens/temperature through to the fallback call', async () => {
    let receivedOpts: any = null
    await callLLM(msgs, { maxTokens: 300, temperature: 0.4 }, {
      deepseek: async () => { throw new Error('DeepSeek down') },
      cerebras: async (_messages, opts) => { receivedOpts = opts; return 'ok' },
    })
    expect(receivedOpts).toEqual({ maxTokens: 300, temperature: 0.4 })
  })
})
