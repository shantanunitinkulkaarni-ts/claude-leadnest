import { test, expect } from '@playwright/test'
import { runWithHedging, type HedgeConfig } from '../../lib/llm'

// Fast config for tests — all timings are tiny so the suite runs in ms, but the
// RATIOS mirror production (hedge < attemptTimeout < deadline).
const cfg = (over: Partial<HedgeConfig> = {}): HedgeConfig => ({
  deadlineMs: 500,
  attemptTimeoutMs: 120,
  hedgeAfterMs: 30,
  maxAttempts: 6,
  maxInFlight: 2,
  ...over,
})

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

test.describe('runWithHedging', () => {
  test('returns the first fast success without extra attempts', async () => {
    let calls = 0
    const out = await runWithHedging(async () => { calls++; return 'hello' }, cfg())
    expect(out).toBe('hello')
    expect(calls).toBe(1) // succeeded immediately → no hedge, no retry
  })

  test('hedges a slow attempt and takes whichever answers first', async () => {
    let calls = 0
    const out = await runWithHedging(async () => {
      calls++
      // First call stalls past the hedge window; the hedged second is fast.
      if (calls === 1) { await delay(300); return 'slow' }
      await delay(5); return 'fast'
    }, cfg())
    expect(out).toBe('fast')
    expect(calls).toBe(2) // hedge fired exactly once
  })

  test('retries fresh when an attempt fails, then succeeds', async () => {
    let calls = 0
    const out = await runWithHedging(async () => {
      calls++
      if (calls <= 2) throw new Error('boom')
      return 'recovered'
    }, cfg())
    expect(out).toBe('recovered')
    expect(calls).toBeGreaterThanOrEqual(3)
  })

  test('treats empty text as failure and retries', async () => {
    let calls = 0
    const out = await runWithHedging(async () => {
      calls++
      return calls < 2 ? '' : 'non-empty'
    }, cfg())
    expect(out).toBe('non-empty')
  })

  test('abandons a stalled attempt at attemptTimeout and replaces it', async () => {
    let calls = 0
    const start = Date.now()
    const out = await runWithHedging(async () => {
      calls++
      // Every attempt stalls LONGER than attemptTimeout except via the hedge
      // path; the first one that resolves quickly wins. Here: 1st stalls forever,
      // hedge (2nd) resolves fast.
      if (calls === 1) { await delay(10_000); return 'never' }
      await delay(5); return 'ok'
    }, cfg())
    expect(out).toBe('ok')
    expect(Date.now() - start).toBeLessThan(500) // didn't wait on the stall
  })

  test('gives up at the deadline when everything stalls', async () => {
    const start = Date.now()
    let error: Error | null = null
    await runWithHedging(
      async () => { await delay(10_000); return 'never' },
      cfg({ deadlineMs: 200, attemptTimeoutMs: 5_000 }) // attempts never time out before deadline
    ).catch(e => { error = e })
    expect(error).not.toBeNull()
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(180)
    expect(elapsed).toBeLessThan(500) // returned at the deadline, not later
  })

  test('rejects after exhausting maxAttempts when all fail', async () => {
    let calls = 0
    let error: Error | null = null
    await runWithHedging(
      async () => { calls++; throw new Error('always') },
      cfg({ maxAttempts: 3, deadlineMs: 2_000 })
    ).catch(e => { error = e })
    expect(error).not.toBeNull()
    expect(calls).toBe(3) // exactly the cap — not more
  })

  test('never exceeds maxInFlight concurrent attempts', async () => {
    let inFlight = 0
    let peak = 0
    let calls = 0
    const out = await runWithHedging(async () => {
      calls++
      inFlight++
      peak = Math.max(peak, inFlight)
      try {
        // All but the last stall long enough to overlap; keep them concurrent.
        if (calls < 4) { await delay(80); throw new Error('slow-fail') }
        await delay(5); return 'done'
      } finally {
        inFlight--
      }
    }, cfg({ maxInFlight: 2, deadlineMs: 2_000 }))
    expect(out).toBe('done')
    expect(peak).toBeLessThanOrEqual(2)
  })

  test('settles once — a late success after deadline does not double-resolve', async () => {
    // The attempt resolves AFTER the deadline has already rejected. Must not
    // throw an unhandled rejection or flip the result.
    let error: Error | null = null
    const p = runWithHedging(
      async () => { await delay(120); return 'late' },
      cfg({ deadlineMs: 40, attemptTimeoutMs: 5_000 })
    ).catch(e => { error = e })
    await p
    expect(error).not.toBeNull() // deadline won
    await delay(200) // let the late attempt resolve in the background
    expect(error).not.toBeNull() // still rejected; no double-settle flipped it
  })
})
