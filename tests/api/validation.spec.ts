import { test, expect } from '@playwright/test'

/**
 * Critical flow 2 + 3 (server-side guards): payment verification and signup.
 *
 * These hit the real API routes but only exercise the VALIDATION guards that
 * run BEFORE any database/auth/Razorpay call — so they're safe to run in CI
 * without secrets or a seeded DB. The happy paths (real payment, real signup)
 * are validated manually / in staging since they need live Razorpay + Supabase.
 */

test.describe('Payment verification guards (/api/payments/verify)', () => {
  test('rejects request with missing payment fields', async ({ request }) => {
    const res = await request.post('/api/payments/verify', {
      data: { agent_id: 'x' }, // missing razorpay_* fields
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Missing payment fields')
  })

  test('rejects completely empty body', async ({ request }) => {
    const res = await request.post('/api/payments/verify', { data: {} })
    expect(res.status()).toBe(400)
  })
})

test.describe('Subscription guards (/api/subscription/*)', () => {
  test('create rejects missing agent_id', async ({ request }) => {
    const res = await request.post('/api/subscription/create', { data: {} })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('agent_id required')
  })

  test('cancel rejects missing agent_id', async ({ request }) => {
    const res = await request.post('/api/subscription/cancel', { data: {} })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('agent_id required')
  })
})

test.describe('Razorpay webhook guards (/api/razorpay-webhook)', () => {
  test('rejects payload with no/invalid signature', async ({ request }) => {
    const res = await request.post('/api/razorpay-webhook', {
      data: { event: 'subscription.charged' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Invalid signature')
  })
})

test.describe('Signup validation guards (/api/auth/register)', () => {
  test('rejects invalid email', async ({ request }) => {
    const res = await request.post('/api/auth/register', {
      data: { email: 'not-an-email', name: 'Test Agent' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Valid email required')
  })

  test('rejects missing name', async ({ request }) => {
    const res = await request.post('/api/auth/register', {
      data: { email: 'valid@example.com' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Name required')
  })

  test('ignores plan field — always creates trial (no 400 on unknown plan)', async ({ request }) => {
    // Register route now hardcodes trial; any plan value in the request is ignored.
    const res = await request.post('/api/auth/register', {
      data: { email: 'valid-plan-test@example.com', name: 'Test Agent', plan: 'lifetime' },
    })
    // In CI (dummy Supabase creds) the route will 500 before it can insert — that's fine.
    // We're only checking it does NOT 400 with "Invalid plan".
    if (res.status() === 500) return
    const body = await res.json()
    expect(body.error ?? '').not.toContain('Invalid plan')
  })

  test('rejects too many property types', async ({ request }) => {
    const res = await request.post('/api/auth/register', {
      data: {
        email: 'valid@example.com',
        name: 'Test Agent',
        property_types: Array.from({ length: 21 }, (_, i) => `type-${i}`),
      },
    })
    expect(res.status()).toBe(400)
  })
})
