import { test, expect } from '@playwright/test'
import { BASE_PATH as BASE } from '../base-path.mjs'

test('creates a new crop type and lands on the detail page', async ({ page }) => {
  await page.goto(`${BASE}/crops/new/`)
  await page.getByPlaceholder('e.g. Tomato').fill('Basil')
  await page.getByRole('button', { name: 'Grown from seed' }).click()
  await page.getByRole('button', { name: 'Save Crop' }).click()

  await expect(page).toHaveURL(new RegExp(`${BASE}/crops/detail`))
  await expect(page.getByText('Basil')).toBeVisible()
})

test('typing an exact match links to the existing crop type without creating a duplicate', async ({ page }) => {
  // Create "Mint" via the form
  await page.goto(`${BASE}/crops/new/`)
  await page.getByPlaceholder('e.g. Tomato').fill('Mint')
  await page.getByRole('button', { name: 'Grown from seed' }).click()
  await page.getByRole('button', { name: 'Save Crop' }).click()
  await expect(page).toHaveURL(new RegExp(`${BASE}/crops/detail`))

  // Type "mint" (different case) in a second entry without selecting a suggestion
  await page.goto(`${BASE}/crops/new/`)
  await page.getByPlaceholder('e.g. Tomato').fill('mint')
  await page.getByRole('button', { name: 'Grown from seed' }).click()
  await page.getByRole('button', { name: 'Save Crop' }).click()
  await expect(page).toHaveURL(new RegExp(`${BASE}/crops/detail`))

  // Only one "Mint" card in the crops list
  await page.goto(`${BASE}/crops/`)
  await expect(page.getByText('Mint')).toHaveCount(1)
})

test('selecting a crop from the dropdown links to the existing crop type', async ({ page }) => {
  // Create "Thyme" first
  await page.goto(`${BASE}/crops/new/`)
  await page.getByPlaceholder('e.g. Tomato').fill('Thyme')
  await page.getByRole('button', { name: 'Grown from seed' }).click()
  await page.getByRole('button', { name: 'Save Crop' }).click()
  await expect(page).toHaveURL(new RegExp(`${BASE}/crops/detail`))

  // Second entry — type partial match and select from dropdown
  await page.goto(`${BASE}/crops/new/`)
  await page.getByPlaceholder('e.g. Tomato').fill('Thy')
  await page.getByRole('button', { name: 'Thyme' }).click()
  await page.getByRole('button', { name: 'Grown from seed' }).click()
  await page.getByRole('button', { name: 'Save Crop' }).click()
  await expect(page).toHaveURL(new RegExp(`${BASE}/crops/detail`))

  // Only one "Thyme" card in the crops list
  await page.goto(`${BASE}/crops/`)
  await expect(page.getByText('Thyme')).toHaveCount(1)
})

test('cancelling returns to the crops list without saving', async ({ page }) => {
  await page.goto(`${BASE}/crops/new/`)
  await page.getByPlaceholder('e.g. Tomato').fill('Tomato')
  await page.getByRole('button', { name: /Create/ }).click()
  await page.getByRole('button', { name: 'Cancel' }).click()

  await expect(page).toHaveURL(`${BASE}/crops/`)
  await expect(page.getByText('Tomato')).not.toBeVisible()
})

test('save button is disabled until nursery name is filled', async ({ page }) => {
  await page.goto(`${BASE}/crops/new/`)
  await page.getByPlaceholder('e.g. Tomato').fill('Oregano')
  await page.getByRole('button', { name: /Create/ }).click()
  // Source defaults to Nursery — save should be disabled with no nursery name
  await expect(page.getByRole('button', { name: 'Save Crop' })).toBeDisabled()

  await page.getByPlaceholder('Nursery name').fill('Green Thumb Nursery')
  await expect(page.getByRole('button', { name: 'Save Crop' })).toBeEnabled()
})
