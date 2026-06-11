import { test, expect } from '@playwright/test'

/**
 * Security headers + Help page render.
 * Headers are set in next.config.js and are easy to regress, so we assert them.
 */

test.describe('Security headers', () => {
  test('landing page sends hardening headers', async ({ request }) => {
    const res = await request.get('/')
    const h = res.headers()
    expect(h['x-frame-options']).toBeTruthy()
    expect(h['x-content-type-options']).toBe('nosniff')
    expect(h['referrer-policy']).toBeTruthy()
  })
})

test.describe('Help page', () => {
  test('renders FAQ content', async ({ page }) => {
    await page.goto('/help')
    await expect(page.locator('body')).toContainText(/Help/i)
    await expect(page.locator('body')).not.toContainText('Application error')
  })
})
