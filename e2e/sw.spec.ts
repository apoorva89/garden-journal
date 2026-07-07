import { test, expect } from '@playwright/test'

const BASE = '/garden-journal'

test('navigator.serviceWorker is available on load', async ({ page }) => {
  await page.goto(`${BASE}/journal/`)

  const supported = await page.evaluate(() => 'serviceWorker' in navigator)
  expect(supported).toBe(true)
})

// The app only registers the service worker in production builds.
// In CI we serve the production static export, so we can assert actual registration.
test('service worker is registered after page load', async ({ page }) => {
  test.skip(!process.env.CI, 'Service worker only registers in production builds')

  await page.goto(`${BASE}/journal/`)

  await expect
    .poll(
      () => page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => !!r)),
      { timeout: 10_000 },
    )
    .toBe(true)
})
