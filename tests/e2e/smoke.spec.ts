import { test, expect } from '@playwright/test'

/**
 * Critical flow 1: Signup / Login surface renders.
 * These are smoke tests — they confirm the core pages load without crashing
 * and show the right entry points. They don't submit real credentials
 * (that needs Supabase + a seeded account; covered manually / in staging).
 */

test.describe('Public pages render', () => {
  test('landing page loads with brand + CTA', async ({ page }) => {
    await page.goto('/')
    // Brand name appears somewhere on the page.
    await expect(page.locator('body')).toContainText('Convorian')
    // Page didn't error-boundary out.
    await expect(page.locator('body')).not.toContainText('Application error')
  })

  test('login page shows email/google tabs', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText('Welcome back')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Email', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Google', exact: true })).toBeVisible()
    // Phone-OTP tab removed (no SMS provider configured).
    // Email form fields present by default.
    await expect(page.getByPlaceholder('you@agency.com')).toBeVisible()
  })

  test('login email validation: empty submit stays on page', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Sign in with Email' }).click()
    // HTML5 required validation keeps us on /login.
    await expect(page).toHaveURL(/\/login/)
  })

  test('onboarding page loads', async ({ page }) => {
    await page.goto('/onboarding')
    await expect(page.locator('body')).not.toContainText('Application error')
  })

  test('legal pages render', async ({ page }) => {
    await page.goto('/privacy-policy')
    await expect(page.locator('body')).toContainText(/privacy/i)
    await page.goto('/terms-of-service')
    await expect(page.locator('body')).toContainText(/terms/i)
  })
})
