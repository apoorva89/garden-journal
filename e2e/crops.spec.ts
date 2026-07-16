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

test('detail page shows "No lessons yet" for a newly created crop', async ({ page }) => {
  await page.goto(`${BASE}/crops/new/`)
  await page.getByTestId('form-ready').waitFor()
  await page.getByPlaceholder('e.g. Tomato').fill('Chives')
  await page.getByRole('button', { name: 'Grown from seed' }).click()
  await page.getByRole('button', { name: 'Save Crop' }).click()
  await expect(page).toHaveURL(new RegExp(`${BASE}/crops/detail`))

  await expect(page.getByText('No lessons yet')).toBeVisible()
})

test('adding a lesson makes it appear in the lessons list', async ({ page }) => {
  await page.goto(`${BASE}/crops/new/`)
  await page.getByTestId('form-ready').waitFor()
  await page.getByPlaceholder('e.g. Tomato').fill('Kale')
  await page.getByRole('button', { name: 'Grown from seed' }).click()
  await page.getByRole('button', { name: 'Save Crop' }).click()
  await expect(page).toHaveURL(new RegExp(`${BASE}/crops/detail`))

  await page.getByRole('button', { name: '+ Add lesson' }).click()
  await page.getByPlaceholder('What did you learn?').fill('Needs full sun to thrive')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText('Needs full sun to thrive')).toBeVisible()
  await expect(page.getByRole('button', { name: '+ Add lesson' })).toBeVisible()
})

test('cancelling the lesson form does not add the lesson', async ({ page }) => {
  await page.goto(`${BASE}/crops/new/`)
  await page.getByTestId('form-ready').waitFor()
  await page.getByPlaceholder('e.g. Tomato').fill('Chard')
  await page.getByRole('button', { name: 'Grown from seed' }).click()
  await page.getByRole('button', { name: 'Save Crop' }).click()
  await expect(page).toHaveURL(new RegExp(`${BASE}/crops/detail`))

  await page.getByRole('button', { name: '+ Add lesson' }).click()
  await page.getByPlaceholder('What did you learn?').fill('Draft lesson')
  await page.getByRole('button', { name: 'Cancel' }).click()

  await expect(page.getByText('Draft lesson')).not.toBeVisible()
  await expect(page.getByText('No lessons yet')).toBeVisible()
})

test('lesson save button is disabled until text is entered', async ({ page }) => {
  await page.goto(`${BASE}/crops/new/`)
  await page.getByTestId('form-ready').waitFor()
  await page.getByPlaceholder('e.g. Tomato').fill('Spinach')
  await page.getByRole('button', { name: 'Grown from seed' }).click()
  await page.getByRole('button', { name: 'Save Crop' }).click()
  await expect(page).toHaveURL(new RegExp(`${BASE}/crops/detail`))

  await page.getByRole('button', { name: '+ Add lesson' }).click()
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()

  await page.getByPlaceholder('What did you learn?').fill('Water deeply')
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled()
})

test('yearly instance card shows "From seed" for a seed-grown crop', async ({ page }) => {
  const year = new Date().getFullYear()

  await page.goto(`${BASE}/crops/new/`)
  await page.getByTestId('form-ready').waitFor()
  await page.getByPlaceholder('e.g. Tomato').fill('Beans')
  await page.getByPlaceholder('e.g. Sungold').fill('Provider')
  await page.getByRole('button', { name: 'Grown from seed' }).click()
  await page.getByRole('button', { name: 'Save Crop' }).click()
  await expect(page).toHaveURL(new RegExp(`${BASE}/crops/detail`))

  await expect(page.getByText(`${year} · Provider`)).toBeVisible()
  await expect(page.getByText('From seed')).toBeVisible()
})

test('yearly instance card shows nursery name for a nursery-sourced crop', async ({ page }) => {
  const year = new Date().getFullYear()

  await page.goto(`${BASE}/crops/new/`)
  await page.getByTestId('form-ready').waitFor()
  await page.getByPlaceholder('e.g. Tomato').fill('Peppers')
  await page.getByPlaceholder('e.g. Sungold').fill('Shishito')
  await page.getByPlaceholder('Nursery name').fill('Green Thumb')
  await page.getByRole('button', { name: 'Save Crop' }).click()
  await expect(page).toHaveURL(new RegExp(`${BASE}/crops/detail`))

  await expect(page.getByText(`${year} · Shishito`)).toBeVisible()
  await expect(page.getByText('Green Thumb')).toBeVisible()
})
