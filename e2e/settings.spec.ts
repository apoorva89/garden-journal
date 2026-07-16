import { test, expect } from '@playwright/test'
import { BASE_PATH as BASE } from '../base-path.mjs'

test('typeahead dropdown appears and selecting a result saves coords', async ({ page }) => {
  await page.route('**/geocoding-api.open-meteo.com/**', (route) =>
    route.fulfill({
      json: {
        results: [
          { name: 'Seattle', admin1: 'Washington', country: 'United States', latitude: 47.6062, longitude: -122.3321 },
        ],
      },
    }),
  )

  await page.goto(`${BASE}/settings/`)
  await page.getByPlaceholder('e.g. Seattle, WA').fill('Seattle')
  await expect(page.getByRole('button', { name: /Seattle, Washington/ })).toBeVisible()
  await page.getByRole('button', { name: /Seattle, Washington/ }).click()
  await expect(page.getByText('47.6062, -122.3321')).toBeVisible()
})

test('shows warning when text is typed but no suggestion is selected', async ({ page }) => {
  await page.route('**/geocoding-api.open-meteo.com/**', (route) =>
    route.fulfill({ json: { results: [] } }),
  )

  await page.goto(`${BASE}/settings/`)
  await page.getByPlaceholder('e.g. Seattle, WA').fill('Nowhere Special')
  await expect(page.getByText('Select a location from the list above')).toBeVisible()
})

test('Use current location sets location name from reverse geocode', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 47.6062, longitude: -122.3321 })
  await page.route('**/nominatim.openstreetmap.org/**', (route) =>
    route.fulfill({ json: { address: { city: 'Seattle', state: 'Washington' } } }),
  )

  await page.goto(`${BASE}/settings/`)
  await page.getByRole('button', { name: 'Use current location' }).click()
  await expect(page.getByPlaceholder('e.g. Seattle, WA')).toHaveValue('Seattle, Washington', { timeout: 5000 })
})

test('Use current location falls back to raw coords when reverse geocode fails', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 47.61, longitude: -122.33 })
  await page.route('**/nominatim.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 500, body: 'error' }),
  )

  await page.goto(`${BASE}/settings/`)
  await page.getByRole('button', { name: 'Use current location' }).click()
  await expect(page.getByPlaceholder('e.g. Seattle, WA')).toHaveValue('47.61, -122.33', { timeout: 5000 })
})

test('Use current location shows error when permission is denied', async ({ page }) => {
  await page.goto(`${BASE}/settings/`)
  await page.getByRole('button', { name: 'Use current location' }).click()
  await expect(page.getByText(/Location access denied|Could not get your location/)).toBeVisible({ timeout: 5000 })
})

test('wipe confirm accept redirects to journal', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept())
  await page.goto(`${BASE}/settings/`)
  await page.getByRole('button', { name: 'Wipe local database' }).click()
  await expect(page).toHaveURL(`${BASE}/journal/`, { timeout: 5000 })
})

test('wipe confirm dismiss stays on settings', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.dismiss())
  await page.goto(`${BASE}/settings/`)
  await page.getByRole('button', { name: 'Wipe local database' }).click()
  await expect(page).toHaveURL(`${BASE}/settings/`)
})

test('clicking a provider pill saves immediately without blur', async ({ page }) => {
  await page.goto(`${BASE}/settings/`)
  await page.getByRole('button', { name: 'anthropic' }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'anthropic' })).toHaveClass(/bg-forest/)
})

test('last frost date, model, and API key persist after blur', async ({ page }) => {
  await page.goto(`${BASE}/settings/`)

  await page.locator('input[type="date"]').fill('2026-04-15')
  await page.locator('input[type="date"]').press('Tab')

  await page.getByPlaceholder('e.g. claude-sonnet-4-6').fill('claude-sonnet-4-6')
  await page.getByPlaceholder('e.g. claude-sonnet-4-6').press('Tab')

  await page.getByPlaceholder('sk-ant-...').fill('sk-ant-test')
  await page.getByPlaceholder('sk-ant-...').press('Tab')

  await page.reload()

  await expect(page.locator('input[type="date"]')).toHaveValue('2026-04-15')
  await expect(page.getByPlaceholder('e.g. claude-sonnet-4-6')).toHaveValue('claude-sonnet-4-6')
  await expect(page.getByPlaceholder('sk-ant-...')).toHaveValue('sk-ant-test')
})
