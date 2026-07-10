import { test, expect } from '@playwright/test'
import { BASE_PATH as BASE } from '../base-path.mjs'

test('shows empty state when no crops exist', async ({ page }) => {
  await page.goto(`${BASE}/crops/`)
  await page.getByTestId('loading').waitFor({ state: 'detached' })
  await expect(page.getByText('No crops yet')).toBeVisible()
})

test('a saved crop appears in the crops list', async ({ page }) => {
  await page.goto(`${BASE}/crops/new/`)
  await page.getByPlaceholder('e.g. Tomato').fill('Rosemary')
  await page.getByRole('button', { name: 'Grown from seed' }).click()
  await page.getByRole('button', { name: 'Save Crop' }).click()
  await expect(page).toHaveURL(new RegExp(`${BASE}/crops/detail`))

  await page.goto(`${BASE}/crops/`)
  await page.getByTestId('loading').waitFor({ state: 'detached' })
  await expect(page.getByText('Rosemary')).toBeVisible()
})

test('tapping a crop card navigates to the detail page', async ({ page }) => {
  await page.goto(`${BASE}/crops/new/`)
  await page.getByPlaceholder('e.g. Tomato').fill('Lavender')
  await page.getByRole('button', { name: 'Grown from seed' }).click()
  await page.getByRole('button', { name: 'Save Crop' }).click()
  await expect(page).toHaveURL(new RegExp(`${BASE}/crops/detail`))

  await page.goto(`${BASE}/crops/`)
  await page.getByTestId('loading').waitFor({ state: 'detached' })
  await page.getByText('Lavender').click()

  await expect(page).toHaveURL(new RegExp(`${BASE}/crops/detail`))
  await expect(page.getByText('Lavender')).toBeVisible()
})

test('back button on detail page returns to crops list', async ({ page }) => {
  await page.goto(`${BASE}/crops/new/`)
  await page.getByPlaceholder('e.g. Tomato').fill('Sage')
  await page.getByRole('button', { name: 'Grown from seed' }).click()
  await page.getByRole('button', { name: 'Save Crop' }).click()

  await expect(page).toHaveURL(new RegExp(`${BASE}/crops/detail`))
  await page.getByRole('button', { name: /Back/ }).click()

  await expect(page).toHaveURL(`${BASE}/crops/`)
})
