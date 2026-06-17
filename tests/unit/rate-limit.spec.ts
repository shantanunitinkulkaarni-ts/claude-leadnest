import { test, expect } from '@playwright/test'
import { checkRateLimit, _resetRateLimits } from '../../lib/rateLimit'

test.describe('checkRateLimit', () => {
  test.beforeEach(() => _resetRateLimits())

  test('allows requests under the limit', () => {
    const r1 = checkRateLimit('k1', 3, 60_000, 1000)
    const r2 = checkRateLimit('k1', 3, 60_000, 1000)
    expect(r1.allowed).toBe(true)
    expect(r2.allowed).toBe(true)
    expect(r2.remaining).toBe(1)
  })

  test('blocks once the limit is hit within the window', () => {
    checkRateLimit('k2', 2, 60_000, 1000)
    checkRateLimit('k2', 2, 60_000, 1000)
    const r3 = checkRateLimit('k2', 2, 60_000, 1000)
    expect(r3.allowed).toBe(false)
    expect(r3.remaining).toBe(0)
  })

  test('different keys have independent buckets', () => {
    checkRateLimit('a', 1, 60_000, 1000)
    const rb = checkRateLimit('b', 1, 60_000, 1000)
    expect(rb.allowed).toBe(true)
  })

  test('old entries fall out of the window and free up capacity', () => {
    checkRateLimit('k3', 1, 1000, 1000)        // uses the only slot at t=1000
    const blocked = checkRateLimit('k3', 1, 1000, 1500) // still within window
    expect(blocked.allowed).toBe(false)
    const allowed = checkRateLimit('k3', 1, 1000, 2200) // window has slid past t=1000
    expect(allowed.allowed).toBe(true)
  })

  test('_resetRateLimits clears all buckets', () => {
    checkRateLimit('k4', 1, 60_000, 1000)
    _resetRateLimits()
    const r = checkRateLimit('k4', 1, 60_000, 1000)
    expect(r.allowed).toBe(true)
  })
})
