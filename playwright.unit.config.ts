import { defineConfig } from '@playwright/test'

// Pure-function unit tests (tests/unit/**) — no Next server, no browser.
// Lets the team verify bot logic (language detection, nurture timeline, property
// matching, intent) in seconds instead of waiting on a full dev-server boot.
// Run with: npm run test:unit
export default defineConfig({
  testDir: './tests/unit',
  timeout: 10_000,
  expect: { timeout: 5_000 },
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  // No webServer block on purpose — these tests import pure functions only.
})
