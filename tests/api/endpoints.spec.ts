import { test, expect } from '@playwright/test'

/**
 * Guard + auth tests for the newer API surfaces (support chat, billing,
 * receipts). Like the other API specs these only exercise validation/auth
 * that runs BEFORE any secret-dependent work, so they're safe in CI.
 */

test.describe('Support chat (/api/support-chat)', () => {
  test('rejects empty body', async ({ request }) => {
    const res = await request.post('/api/support-chat', { data: {} })
    expect(res.status()).toBe(400)
  })

  test('rejects non-array messages', async ({ request }) => {
    const res = await request.post('/api/support-chat', { data: { messages: 'hi' } })
    expect(res.status()).toBe(400)
  })
})

test.describe('Support feedback (/api/support-feedback)', () => {
  test('rejects missing log_id / helpful', async ({ request }) => {
    const res = await request.post('/api/support-feedback', { data: { log_id: 'x' } })
    expect(res.status()).toBe(400)
  })
})

test.describe('Billing endpoints require auth', () => {
  test('invoices: 400 without agent_id', async ({ request }) => {
    const res = await request.get('/api/subscription/invoices')
    expect(res.status()).toBe(400)
  })

  test('invoices: 401 when unauthenticated', async ({ request }) => {
    const res = await request.get('/api/subscription/invoices?agent_id=00000000-0000-0000-0000-000000000000')
    expect(res.status()).toBe(401)
  })

  test('receipt: 400 without params', async ({ request }) => {
    const res = await request.get('/api/subscription/receipt')
    expect(res.status()).toBe(400)
  })

  test('receipt: 401 when unauthenticated', async ({ request }) => {
    const res = await request.get('/api/subscription/receipt?agent_id=00000000-0000-0000-0000-000000000000&event_id=00000000-0000-0000-0000-000000000000')
    expect(res.status()).toBe(401)
  })
})

test.describe('Agent API protects data', () => {
  test('agent read requires auth', async ({ request }) => {
    const res = await request.get('/api/agent?id=00000000-0000-0000-0000-000000000000')
    expect(res.status()).toBe(401)
  })
})
