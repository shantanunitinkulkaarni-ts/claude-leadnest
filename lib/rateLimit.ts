// ─────────────────────────────────────────────────────────────────────────────
// In-memory sliding-window rate limiter for the webhook.
//
// Vercel serverless functions are not guaranteed to share memory across
// concurrent invocations or regions, so this is a best-effort cap per warm
// instance — not a perfectly distributed limit. That's an acceptable
// trade-off at current scale (pre-revenue, first handful of agents): it still
// catches the common case (one runaway IP or one agent's number looping)
// without adding a Redis dependency the project doesn't otherwise need.
// ─────────────────────────────────────────────────────────────────────────────

const buckets = new Map<string, number[]>() // key -> timestamps (ms) within the window

export interface RateLimitResult {
  allowed: boolean
  remaining: number
}

export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const cutoff = now - windowMs
  const existing = (buckets.get(key) || []).filter((t) => t > cutoff)
  if (existing.length >= limit) {
    buckets.set(key, existing)
    return { allowed: false, remaining: 0 }
  }
  existing.push(now)
  buckets.set(key, existing)
  return { allowed: true, remaining: limit - existing.length }
}

// Test-only: clears all buckets so test cases don't bleed into each other.
export function _resetRateLimits() {
  buckets.clear()
}
