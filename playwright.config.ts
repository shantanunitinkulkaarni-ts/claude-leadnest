import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for Convorian.
 * Boots the Next.js dev server, then runs the test suites in tests/.
 * In CI we run headless against the dev server on port 3003.
 */
const PORT = process.env.PORT || 3003
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests',
  // Pure-function unit tests run separately (no server) via playwright.unit.config.ts.
  testIgnore: '**/tests/unit/**',
  // Next.js dev compiles routes on first hit — give cold compiles room.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // Fail the build on CI if test.only is accidentally left in.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // One worker in CI keeps the rate-limited demo/API endpoints predictable.
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Start the app automatically unless BASE_URL points at an already-running server.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `npm run dev -- -p ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
