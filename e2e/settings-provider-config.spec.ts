import { test, expect } from '@playwright/test'
import { BASE_PATH as BASE } from '../base-path.mjs'
import { PROVIDERS } from '../lib/ai/providerConfig'

test('Settings page shows provider buttons derived from config', async ({ page }) => {
  await page.goto(`${BASE}/settings/`)
  for (const provider of PROVIDERS) {
    await expect(page.getByRole('button', { name: provider.label, exact: true })).toBeVisible()
  }
})

test('Settings page shows no extra provider buttons beyond config', async ({ page }) => {
  // Verifies each known provider appears exactly once. Does not detect an extra
  // pill whose label doesn't match any known provider label — the structural
  // scan (AC1) is the enforcement layer for that case.
  await page.goto(`${BASE}/settings/`)
  for (const provider of PROVIDERS) {
    await expect(page.getByRole('button', { name: provider.label, exact: true })).toHaveCount(1)
  }
})

test('Selecting a provider shows its model suggestion pills', async ({ page }) => {
  await page.goto(`${BASE}/settings/`)
  // Use the second provider so the click is always a state change regardless of
  // what prior tests may have left selected in the DB.
  const second = PROVIDERS[1]
  await page.getByRole('button', { name: second.label, exact: true }).click()
  for (const model of second.models) {
    await expect(page.getByRole('button', { name: model, exact: true })).toBeVisible()
  }
})
