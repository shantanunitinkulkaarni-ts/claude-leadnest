import { test, expect } from '@playwright/test'

/**
 * Critical flow 3: the AI bot replies.
 *
 * The demo-chat endpoint powers the live landing-page chat. We always verify
 * it degrades gracefully (returns JSON, never an HTML crash). When GLM_API_KEY
 * is available in the environment, we also assert it returns a real reply.
 */

test.describe('Demo bot endpoint (/api/demo-chat)', () => {
  test('malformed request returns JSON error, not a crash', async ({ request }) => {
    const res = await request.post('/api/demo-chat', { data: {} })
    // Should be a handled error (400/500 JSON), never a 200 HTML page.
    expect(res.headers()['content-type']).toContain('application/json')
    expect([400, 429, 500]).toContain(res.status())
  })

  test('returns a bot reply when the LLM is configured', async ({ request }) => {
    test.skip(!process.env.GLM_API_KEY, 'GLM_API_KEY not set — skipping live bot call')
    const res = await request.post('/api/demo-chat', {
      data: {
        language: 'English',
        messages: [{ role: 'user', content: 'Hi, tell me about the villas.' }],
      },
    })
    // 429 is acceptable (rate limit hit); otherwise expect a real reply.
    if (res.status() === 429) {
      const body = await res.json()
      expect(body.error).toContain('Demo limit')
      return
    }
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(typeof body.response).toBe('string')
    expect(body.response.length).toBeGreaterThan(0)
  })
})
