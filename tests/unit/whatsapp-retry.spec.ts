import { test, expect } from '@playwright/test'
import { sendWithRetry, isRetryableSendError, type SendOutcome } from '../../lib/whatsapp'

const noSleep = async () => {} // skip real delays in tests

// Item #2: retry momentary glitches up to 2 extra times, but never retry a
// permanent rejection, and stop the moment a send succeeds.
test.describe('sendWithRetry', () => {
  test('returns immediately on first success (no retries)', async () => {
    let calls = 0
    const r = await sendWithRetry(async () => { calls++; return { id: 'm1', error: null } }, { sleep: noSleep })
    expect(r.id).toBe('m1')
    expect(calls).toBe(1)
  })

  test('retries a glitch, then succeeds on the 2nd attempt', async () => {
    let calls = 0
    const r = await sendWithRetry(async (): Promise<SendOutcome> => {
      calls++
      return calls < 2 ? { id: null, error: 'timeout', retryable: true } : { id: 'm2', error: null }
    }, { sleep: noSleep })
    expect(r.id).toBe('m2')
    expect(calls).toBe(2)
  })

  test('tries exactly 3 times total when every attempt is a glitch', async () => {
    let calls = 0
    const r = await sendWithRetry(async () => { calls++; return { id: null, error: 'glitch', retryable: true } }, { sleep: noSleep })
    expect(r.id).toBeNull()
    expect(calls).toBe(3) // 1 initial + 2 retries
  })

  test('does NOT retry a permanent rejection (retryable false)', async () => {
    let calls = 0
    const r = await sendWithRetry(async () => { calls++; return { id: null, error: 'number not allowed', retryable: false } }, { sleep: noSleep })
    expect(r.id).toBeNull()
    expect(r.error).toBe('number not allowed')
    expect(calls).toBe(1) // gave up immediately — no wasted retries
  })

  test('honours a custom attempt count', async () => {
    let calls = 0
    await sendWithRetry(async () => { calls++; return { id: null, error: 'x', retryable: true } }, { attempts: 2, sleep: noSleep })
    expect(calls).toBe(2)
  })
})

test.describe('isRetryableSendError', () => {
  test('network/timeout (no HTTP response) is retryable', () => {
    expect(isRetryableSendError({ message: 'socket hang up' })).toBe(true)
  })
  test('429 rate-limit is retryable', () => {
    expect(isRetryableSendError({ response: { status: 429 } })).toBe(true)
  })
  test('5xx server error is retryable', () => {
    expect(isRetryableSendError({ response: { status: 503 } })).toBe(true)
  })
  test('400/403 (bad/blocked request) is NOT retryable', () => {
    expect(isRetryableSendError({ response: { status: 400 } })).toBe(false)
    expect(isRetryableSendError({ response: { status: 403 } })).toBe(false)
  })
})
