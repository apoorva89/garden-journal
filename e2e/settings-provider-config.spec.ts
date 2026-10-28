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
  await page.goto(`${BASE}/settings/`)
  for (const provider of PROVIDERS) {
    await expect(page.getByRole('button', { name: provider.label, exact: true })).toHaveCount(1)
  }
})

test('Selecting a provider shows its model suggestion pills', async ({ page }) => {
  await page.goto(`${BASE}/settings/`)
  const first = PROVIDERS[0]
  await page.getByRole('button', { name: first.label, exact: true }).click()
  for (const model of first.models) {
    await expect(page.getByRole('button', { name: model, exact: true })).toBeVisible()
  }
})
