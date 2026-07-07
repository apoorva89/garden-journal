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

  const browserLogs: string[] = []
  page.on('console', (msg) => browserLogs.push(`[${msg.type()}] ${msg.text()}`))
  page.on('pageerror', (err) => browserLogs.push(`[pageerror] ${err.message}`))

  await page.goto(`${BASE}/journal/`)
  await page.waitForLoadState('networkidle')

  // Check whether sw.js is reachable and is actually JavaScript (not an HTML fallback)
  const swFetch = await page.evaluate(async () => {
    try {
      const res = await fetch('/garden-journal/sw.js')
      const text = await res.text()
      return {
        ok: res.ok,
        status: res.status,
        contentType: res.headers.get('content-type'),
        preview: text.slice(0, 200),
      }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })
  console.log('[SW debug] sw.js fetch:', JSON.stringify(swFetch))

  // Attempt an explicit registration to capture the exact JS error
  const regResult = await page.evaluate(async () => {
    try {
      const reg = await navigator.serviceWorker.register('/garden-journal/sw.js')
      return { success: true, scope: reg.scope }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })
  console.log('[SW debug] explicit register():', JSON.stringify(regResult))

  // Dump all registrations and their states
  const swInfo = await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations()
    return {
      count: regs.length,
      controller: navigator.serviceWorker.controller?.state ?? null,
      registrations: regs.map((r) => ({
        scope: r.scope,
        installing: r.installing?.state ?? null,
        waiting: r.waiting?.state ?? null,
        active: r.active?.state ?? null,
      })),
    }
  })
  console.log('[SW debug] registrations:', JSON.stringify(swInfo))
  console.log('[SW debug] browser logs:', browserLogs)

  await expect
    .poll(
      () => page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => !!r)),
      { timeout: 15_000 },
    )
    .toBe(true)
})
