import { test, expect } from '@playwright/test'
import { BASE_PATH as BASE } from '../base-path.mjs'

// Minimal 1×1 PNG — valid image for file input tests
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

test('photos added to a new entry appear in the feed', async ({ page }) => {
  await page.goto(`${BASE}/journal/new/`)

  await page.locator('input[type="file"]').setInputFiles({
    name: 'garden.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  })
  // Thumbnail appears in the form once the image has been processed
  await expect(page.locator('img[alt="Photo 1"]')).toBeVisible()

  await page.getByPlaceholder('What happened in the garden today?').fill('Photo test entry')
  await page.getByRole('button', { name: 'Save entry' }).click()

  await expect(page).toHaveURL(`${BASE}/journal/`)
  // PhotoStrip renders an img inside the entry card
  await expect(page.locator('.rounded-2xl img').first()).toBeVisible()
})

test('photos can be tagged with crop tags in a new entry', async ({ page }) => {
  await page.goto(`${BASE}/journal/new/`)

  await page.locator('input[type="file"]').setInputFiles({
    name: 'garden.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  })
  await expect(page.locator('img[alt="Photo 1"]')).toBeVisible()

  // Clicking the thumbnail opens the crop tag sheet
  await page.locator('img[alt="Photo 1"]').click()
  await expect(page.getByText('Tag crops in photo')).toBeVisible()

  // Create a brand-new crop and confirm it is auto-checked
  await page.getByText('Create new crop').click()
  await page.getByPlaceholder('Crop name…').fill('Sunflowers')
  await page.getByRole('button', { name: 'Add' }).click()

  // Done button reflects the 1 selected crop
  await expect(page.getByRole('button', { name: /Done — 1 crop tagged/ })).toBeVisible()
  await page.getByRole('button', { name: /Done — 1 crop tagged/ }).click()

  // Badge appears on the photo thumbnail
  await expect(page.getByText('1 tagged')).toBeVisible()
})

test('a crop created in one entry is available in the next', async ({ page }) => {
  // Entry 1: navigate from /journal/ so Cancel (router.back) reliably returns there
  await page.goto(`${BASE}/journal/`)
  await page.getByRole('link', { name: 'New entry' }).click()
  await expect(page).toHaveURL(`${BASE}/journal/new/`)

  await page.locator('input[type="file"]').setInputFiles({
    name: 'garden.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  })
  await expect(page.locator('img[alt="Photo 1"]')).toBeVisible()

  await page.locator('img[alt="Photo 1"]').click()
  await page.getByText('Create new crop').click()
  await page.getByPlaceholder('Crop name…').fill('Lavender')
  await page.getByRole('button', { name: 'Add' }).click()
  await page.getByRole('button', { name: /Done/ }).click()

  // Cancel — createCropType already wrote to IndexedDB so Lavender persists
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page).toHaveURL(`${BASE}/journal/`)

  // Entry 2: open a new entry and verify Lavender shows up in the tag sheet
  await page.getByRole('link', { name: 'New entry' }).click()
  await expect(page).toHaveURL(`${BASE}/journal/new/`)

  await page.locator('input[type="file"]').setInputFiles({
    name: 'garden.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  })
  await expect(page.locator('img[alt="Photo 1"]')).toBeVisible()

  await page.locator('img[alt="Photo 1"]').click()
  await expect(page.getByText('Tag crops in photo')).toBeVisible()
  await expect(page.getByText('Lavender')).toBeVisible()
})

test('cancelling a new entry does not add it to the feed', async ({ page }) => {
  // Navigate from /journal/ so that Cancel (router.back) reliably returns there
  await page.goto(`${BASE}/journal/`)
  await page.getByRole('link', { name: 'New entry' }).click()
  await expect(page).toHaveURL(`${BASE}/journal/new/`)

  await page.getByPlaceholder('What happened in the garden today?').fill('Entry that should not be saved')
  await page.getByRole('button', { name: 'Cancel' }).click()

  await expect(page).toHaveURL(`${BASE}/journal/`)
  await expect(page.getByText('Entry that should not be saved')).not.toBeVisible()
})

test('date picker updates the form header and the saved entry date', async ({ page }) => {
  await page.goto(`${BASE}/journal/new/`)

  // Pick the 10th of the current month — different from today on all but one day a month,
  // and fill() bypasses the HTML max attribute so future dates within the month work fine.
  const yearMonth = new Date().toISOString().slice(0, 7)
  const targetDate = `${yearMonth}-10`
  const d = new Date(`${targetDate}T00:00:00`)
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' })
  const day = d.getDate()
  const month = d.toLocaleDateString('en-GB', { month: 'long' })

  await page.locator('input[type="date"]').fill(targetDate)

  // The date header in the form re-renders immediately with the new date
  await expect(page.locator('body')).toContainText(`${weekday}, ${day} ${month}`)

  await page.getByPlaceholder('What happened in the garden today?').fill('Date picker entry')
  await page.getByRole('button', { name: 'Save entry' }).click()
  await expect(page).toHaveURL(`${BASE}/journal/`)

  // The entry card in the feed shows the updated date in its heading
  await expect(page.locator('h2').first()).toContainText(`${weekday}, ${day} ${month}`)
})

test('entry feed is ordered newest date first', async ({ page }) => {
  const yearMonth = new Date().toISOString().slice(0, 7)
  // Fixed dates within the current month — fill() bypasses the max attribute,
  // so these work regardless of what today's date is.
  const olderDate = `${yearMonth}-01`
  const newerDate = `${yearMonth}-20`

  // Create the older entry via the date picker
  await page.goto(`${BASE}/journal/new/`)
  await page.locator('input[type="date"]').fill(olderDate)
  await page.getByPlaceholder('What happened in the garden today?').fill('Older entry')
  await page.getByRole('button', { name: 'Save entry' }).click()
  await expect(page).toHaveURL(`${BASE}/journal/`)

  // Create the newer entry via the date picker
  await page.goto(`${BASE}/journal/new/`)
  await page.locator('input[type="date"]').fill(newerDate)
  await page.getByPlaceholder('What happened in the garden today?').fill('Newer entry')
  await page.getByRole('button', { name: 'Save entry' }).click()
  await expect(page).toHaveURL(`${BASE}/journal/`)

  // Feed sorts by date descending — newer date must appear before older date
  const cards = page.locator('.rounded-2xl p.text-sm')
  await expect(cards.first()).toContainText('Newer entry')
  await expect(cards.nth(1)).toContainText('Older entry')
})
