import { test, expect } from '@playwright/test'
import { BASE_PATH as BASE } from '../base-path.mjs'

test('redirects from / to /journal', async ({ page }) => {
  await page.goto(`${BASE}/`)
  await expect(page).toHaveURL(`${BASE}/journal/`)
})

test('tab bar navigates between tabs', async ({ page }) => {
  await page.goto(`${BASE}/journal/`)

  await page.getByRole('link', { name: 'Crops' }).click()
  await expect(page).toHaveURL(`${BASE}/crops/`)

  await page.getByRole('link', { name: 'Next Season' }).click()
  await expect(page).toHaveURL(`${BASE}/next-season/`)

  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(`${BASE}/settings/`)
  await page.waitForLoadState('networkidle')

  await page.getByRole('link', { name: 'Journal' }).click()
  await expect(page).toHaveURL(`${BASE}/journal/`)
})

test('active tab is visually distinct', async ({ page }) => {
  await page.goto(`${BASE}/journal/`)
  const journalLink = page.getByRole('link', { name: 'Journal' })
  const cropsLink = page.getByRole('link', { name: 'Crops' })

  await expect(journalLink).toHaveClass(/text-forest/)
  await expect(cropsLink).not.toHaveClass(/text-forest/)

  await cropsLink.click()
  await expect(cropsLink).toHaveClass(/text-forest/)
  await expect(journalLink).not.toHaveClass(/text-forest/)
})
