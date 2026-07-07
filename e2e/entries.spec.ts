import { test, expect } from '@playwright/test'

const BASE = '/garden-journal'

test('creates a journal entry and it appears in the feed', async ({ page }) => {
  await page.goto(`${BASE}/journal/new/`)

  const entryText = 'Planted tomatoes today in the raised bed.'
  await page.getByPlaceholder('What happened in the garden today?').fill(entryText)
  await page.getByRole('button', { name: 'Save entry' }).click()

  await expect(page).toHaveURL(`${BASE}/journal/`)
  await expect(page.getByText(entryText)).toBeVisible()
})

test('tapping an entry in the feed opens the detail view', async ({ page }) => {
  await page.goto(`${BASE}/journal/new/`)

  const entryText = 'Watered the beans and checked for aphids.'
  await page.getByPlaceholder('What happened in the garden today?').fill(entryText)
  await page.getByRole('button', { name: 'Save entry' }).click()

  await expect(page).toHaveURL(`${BASE}/journal/`)
  await page.getByText(entryText).click()

  await expect(page).toHaveURL(/\/garden-journal\/journal\/entry\//)
  await expect(page.getByPlaceholder('What happened in the garden today?')).toHaveValue(entryText)
})
