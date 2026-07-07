import { defineConfig, devices } from '@playwright/test'
import { BASE_PATH } from './base-path.mjs'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['iPhone 15'] } },
  ],
  webServer: {
    // CI: serve the production static export so tests run against what actually ships.
    // Locally: use the dev server for fast iteration without a build step.
    command: process.env.CI
      ? `mkdir -p .serve${BASE_PATH} && cp -r out/. .serve${BASE_PATH}/ && serve .serve -l 3000 --no-clipboard`
      : 'npm run dev',
    url: `http://localhost:3000${BASE_PATH}/journal`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
