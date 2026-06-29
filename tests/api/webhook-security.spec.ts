import { test, expect } from '@playwright/test'

// Integration tests for the webhook auth gate (app/api/webhook/route.ts).
//
// The auth gate rejects forged POSTs with 403 before any body parsing,
// agent lookup, or DB work. A 403 (or 500-misconfigured) response proves
// the handler exited before touching any database rows.
//
// CI note: tests that require the correct secret only run when
// WEBHOOK_SIMULATE_SECRET is set in the test process env (matching the
// running server). The rejection tests always run.

const CONFIGURED_SECRET = process.env.WEBHOOK_SIMULATE_SECRET

const webhookPayload = {
  integratedNumber: '919999999999',
  customerNumber: '919876543210',
  uuid: 'test-uuid-webhook-auth',
  contentType: 'text',
  text: 'Hello auth test',
}

test.describe('POST /api/webhook — auth gate rejects forged requests', () => {
  test('missing x-webhook-secret header → rejected (403 or 500)', async ({ request }) => {
    const res = await request.post('/api/webhook', {
      data: webhookPayload,
      headers: { 'Content-Type': 'application/json' },
    })
    // 403 = secret set, header missing → correctly rejected.
    // 500 = secret not configured at all → still rejected, no DB writes.
    // Both prove the handler exited before any Supabase calls.
    expect([403, 500]).toContain(res.status())
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  test('wrong x-webhook-secret → 403 (only when server has secret configured)', async ({ request }) => {
    test.skip(!CONFIGURED_SECRET, 'WEBHOOK_SIMULATE_SECRET not set — server would 500 before checking header')
    const res = await request.post('/api/webhook', {
      data: webhookPayload,
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': 'this-is-definitely-wrong',
      },
    })
    expect(res.status()).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Forbidden')
  })

  test('empty x-webhook-secret → rejected (403 or 500)', async ({ request }) => {
    const res = await request.post('/api/webhook', {
      data: webhookPayload,
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': '',
      },
    })
    expect([403, 500]).toContain(res.status())
  })

  test('correct x-webhook-secret → auth gate passes, request processed (200)', async ({ request }) => {
    test.skip(!CONFIGURED_SECRET, 'WEBHOOK_SIMULATE_SECRET not set in test env — skip correct-auth test')
    const res = await request.post('/api/webhook', {
      data: webhookPayload,
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': CONFIGURED_SECRET!,
      },
    })
    // Auth passed. Downstream may return any 200 status (agent_not_found, duplicate, ok, etc.)
    // We only assert the auth gate did NOT reject it.
    expect(res.status()).not.toBe(403)
    expect(res.status()).not.toBe(500)
    expect(res.status()).toBe(200)
  })
})
