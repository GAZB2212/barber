import { defineConfig, devices } from '@playwright/test'

/**
 * The sandbox ships one Chromium build, which may not match the revision this
 * Playwright version would download. Pointing at it directly keeps the suite
 * runnable here; CI with `npx playwright install` needs neither override.
 */
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Pixel 7'],
    trace: 'off',
    screenshot: 'only-on-failure',
    ...(CHROMIUM ? { launchOptions: { executablePath: CHROMIUM } } : {}),
  },
})
