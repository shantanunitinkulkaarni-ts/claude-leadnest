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

  test('rejects invalid plan value', async ({ request }) => {
    const res = await request.post('/api/auth/register', {
      data: { email: 'valid@example.com', name: 'Test Agent', plan: 'lifetime' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Invalid plan')
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
