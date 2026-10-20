import { test, expect, type Page } from '@playwright/test'
import { BASE_PATH as BASE } from '../base-path.mjs'

// ── Helpers ───────────────────────────────────────────────────────────────────

interface SeedSettings {
  latitude?: number | null
  longitude?: number | null
  aiProvider?: string
  aiModel?: string
  apiKey?: string
}

interface SeedEntry {
  id: string
  date: string
  text?: string
}

async function seedDb(
  page: Page,
  entries: SeedEntry[],
  settings: SeedSettings,
) {
  await page.evaluate(
    ({ entries, settings }) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('garden-journal', 1)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction(['journalEntries', 'settings'], 'readwrite')
          const entryStore = tx.objectStore('journalEntries')
          const settingsStore = tx.objectStore('settings')

          for (const e of entries) {
            entryStore.put({
              id: e.id,
              date: e.date,
              yearMonth: e.date.slice(0, 7),
              text: e.text ?? '',
              nextSeasonNote: '',
              weatherC: null,
              weatherIcon: null,
              photoIds: [],
              needsSync: 1,
              createdAt: e.date + 'T10:00:00Z',
              updatedAt: e.date + 'T10:00:00Z',
            })
          }

          settingsStore.put(
            {
              locationName: settings.latitude ? 'Seattle' : '',
              lastFrostDate: null,
              latitude: settings.latitude ?? null,
              longitude: settings.longitude ?? null,
              aiProvider: settings.aiProvider ?? '',
              aiModel: settings.aiModel ?? '',
              apiKeys: settings.apiKey ? { [settings.aiProvider ?? 'anthropic']: settings.apiKey } : {},
            },
            'settings',
          )

          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        }
      })
    },
    { entries, settings },
  )
}

async function seedPendingExtraction(
  page: Page,
  entryId: string,
) {
  await page.evaluate(
    (entryId) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('garden-journal', 1)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('pendingExtractions', 'readwrite')
          tx.objectStore('pendingExtractions').put({
            entryId,
            events: [],
            usage: { inputTokens: 100, outputTokens: 50 },
            createdAt: new Date().toISOString(),
          })
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        }
      })
    },
    entryId,
  )
}

const WEATHER_MOCK = {
  daily: {
    temperature_2m_mean: [18],
    weathercode: [0],
  },
}

// ── AC-12: Banner tests ───────────────────────────────────────────────────────

test.describe('SyncSheet banner: names missing location', () => {
  test('shows location missing banner when no location configured', async ({ page }) => {
    await page.goto(`${BASE}/journal/`)
    await seedDb(page, [{ id: 'e1', date: '2026-06-01', text: 'Some text' }], {
      latitude: null,
      longitude: null,
      aiProvider: 'anthropic',
      aiModel: 'claude-sonnet-4-6',
      apiKey: 'sk-ant-test',
    })
    await page.reload()
    await page.getByRole('button', { name: /Sync/ }).click()
    await expect(page.getByTestId('missing-config-banner')).toContainText('Location not set')
  })
})

test.describe('SyncSheet banner: names missing AI config', () => {
  test('shows AI missing banner when no AI configured', async ({ page }) => {
    await page.route('**/archive-api.open-meteo.com/**', (route) => route.fulfill({ json: WEATHER_MOCK }))
    await page.goto(`${BASE}/journal/`)
    await seedDb(page, [{ id: 'e1', date: '2026-06-01', text: 'Some text' }], {
      latitude: 47.6062,
      longitude: -122.3321,
    })
    await page.reload()
    await page.getByRole('button', { name: /Sync/ }).click()
    await expect(page.getByTestId('missing-config-banner')).toContainText('AI not configured')
  })
})

test.describe('SyncSheet banner: names both', () => {
  test('shows both missing when neither location nor AI configured', async ({ page }) => {
    await page.goto(`${BASE}/journal/`)
    await seedDb(page, [{ id: 'e1', date: '2026-06-01', text: 'Some text' }], {
      latitude: null,
      longitude: null,
    })
    await page.reload()
    await page.getByRole('button', { name: /Sync/ }).click()
    await expect(page.getByTestId('missing-config-banner')).toContainText('Location and AI config missing')
  })
})

test.describe('SyncSheet banner: shows nothing when both configured', () => {
  test('no banner when both location and AI are configured', async ({ page }) => {
    await page.route('**/archive-api.open-meteo.com/**', (route) => route.fulfill({ json: WEATHER_MOCK }))
    await page.goto(`${BASE}/journal/`)
    await seedDb(page, [{ id: 'e1', date: '2026-06-01', text: 'Some text' }], {
      latitude: 47.6062,
      longitude: -122.3321,
      aiProvider: 'anthropic',
      aiModel: 'claude-sonnet-4-6',
      apiKey: 'sk-ant-test',
    })
    await page.reload()
    await page.getByRole('button', { name: /Sync/ }).click()
    await expect(page.getByTestId('missing-config-banner')).not.toBeVisible()
  })
})

// ── AC-13: Row ordering and state columns ─────────────────────────────────────

test.describe('SyncSheet rows: oldest-first order and state columns', () => {
  test('rows are ordered oldest-first', async ({ page }) => {
    await page.route('**/archive-api.open-meteo.com/**', (route) => route.fulfill({ json: WEATHER_MOCK }))
    await page.goto(`${BASE}/journal/`)
    await seedDb(
      page,
      [
        { id: 'e-newest', date: '2026-06-20' },
        { id: 'e-oldest', date: '2026-06-01' },
        { id: 'e-middle', date: '2026-06-10' },
      ],
      { latitude: 47.6062, longitude: -122.3321 },
    )
    await page.reload()
    await page.getByRole('button', { name: /Sync/ }).click()

    const dates = await page.locator('.bg-cream p.text-forest').allTextContents()
    // Oldest entry date should appear first
    expect(dates[0]).toContain('Jun')
    // All three entries present
    expect(dates).toHaveLength(3)
    // Check ordering: first date is earlier than last
    const firstDate = new Date(dates[0].replace(/\w+,\s/, ''))
    const lastDate = new Date(dates[2].replace(/\w+,\s/, ''))
    expect(firstDate.getTime()).toBeLessThan(lastDate.getTime())
  })

  test('no-text entry has no AI state shown', async ({ page }) => {
    await page.route('**/archive-api.open-meteo.com/**', (route) => route.fulfill({ json: WEATHER_MOCK }))
    await page.goto(`${BASE}/journal/`)
    await seedDb(
      page,
      [{ id: 'e-notext', date: '2026-06-01', text: '' }],
      { latitude: 47.6062, longitude: -122.3321 },
    )
    await page.reload()
    await page.getByRole('button', { name: /Sync/ }).click()

    // No AI status element for a no-text entry
    await expect(page.getByTestId('ai-status-e-notext')).not.toBeVisible()
  })

  test('Review arrow appears when PendingExtraction exists, absent otherwise', async ({ page }) => {
    await page.route('**/archive-api.open-meteo.com/**', (route) => route.fulfill({ json: WEATHER_MOCK }))
    await page.goto(`${BASE}/journal/`)
    await seedDb(
      page,
      [
        { id: 'e-with-extraction', date: '2026-06-01', text: 'Has extraction' },
        { id: 'e-no-extraction', date: '2026-06-02', text: 'No extraction yet' },
      ],
      {
        latitude: 47.6062,
        longitude: -122.3321,
        aiProvider: 'anthropic',
        aiModel: 'claude-sonnet-4-6',
        apiKey: 'sk-ant-test',
      },
    )
    // Seed a PendingExtraction for e-with-extraction
    await seedPendingExtraction(page, 'e-with-extraction')
    await page.reload()
    await page.getByRole('button', { name: /Sync/ }).click()

    await expect(page.getByTestId('review-link-e-with-extraction')).toBeVisible()
    await expect(page.getByTestId('review-link-e-with-extraction')).toContainText('Review')
    await expect(page.getByTestId('review-link-e-no-extraction')).not.toBeVisible()
  })
})

// ── AC-14: Post-run summary ───────────────────────────────────────────────────

test.describe('SyncSheet: post-run summary shows weather and AI counts separately', () => {
  test('summary appears after sync and reports weather and AI separately', async ({ page }) => {
    await page.route('**/archive-api.open-meteo.com/**', (route) => route.fulfill({ json: WEATHER_MOCK }))
    await page.goto(`${BASE}/journal/`)
    await seedDb(
      page,
      [
        { id: 'e1', date: '2026-06-01', text: 'Entry one' },
        { id: 'e2', date: '2026-06-02', text: '' },
      ],
      {
        latitude: 47.6062,
        longitude: -122.3321,
        aiProvider: 'anthropic',
        aiModel: 'claude-sonnet-4-6',
        apiKey: 'sk-ant-test',
      },
    )
    await page.reload()
    await page.getByRole('button', { name: /Sync/ }).click()
    await page.getByTestId('sync-button').click()

    await expect(page.getByTestId('sync-summary')).toBeVisible({ timeout: 10000 })
    const summaryText = await page.getByTestId('sync-summary').textContent()
    expect(summaryText).toMatch(/Weather:/)
    expect(summaryText).toMatch(/AI:/)
  })
})

// ── AC-15: Sync Now disabled during run and on reopen ─────────────────────────

test.describe('SyncSheet: Sync Now disabled during run and on reopen', () => {
  test('button is disabled while sync is in progress', async ({ page, browserName }) => {
    // WebKit may have timing issues with slow-route delays; scope to chromium
    test.skip(browserName === 'webkit', 'Q-2: WebKit timing may be flaky for slow-fetch scenarios')

    // Use a delayed weather route
    let unblockFetch!: () => void
    const fetchBlocked = new Promise<void>((resolve) => { unblockFetch = resolve })

    await page.route('**/archive-api.open-meteo.com/**', async (route) => {
      await fetchBlocked
      await route.fulfill({ json: WEATHER_MOCK })
    })

    await page.goto(`${BASE}/journal/`)
    await seedDb(
      page,
      [{ id: 'e1', date: '2026-06-01', text: '' }],
      { latitude: 47.6062, longitude: -122.3321 },
    )
    await page.reload()
    await page.getByRole('button', { name: /Sync/ }).click()
    await page.getByTestId('sync-button').click()

    // Button should be disabled while syncing
    await expect(page.getByTestId('sync-button')).toBeDisabled()

    // Unblock the fetch so the test can clean up
    unblockFetch()
    await expect(page.getByTestId('sync-button')).not.toBeDisabled({ timeout: 10000 })
  })

  test('button is disabled when sheet is reopened while sync is in progress', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Q-2: WebKit timing may be flaky for slow-fetch scenarios')

    let unblockFetch!: () => void
    const fetchBlocked = new Promise<void>((resolve) => { unblockFetch = resolve })

    await page.route('**/archive-api.open-meteo.com/**', async (route) => {
      await fetchBlocked
      await route.fulfill({ json: WEATHER_MOCK })
    })

    await page.goto(`${BASE}/journal/`)
    await seedDb(
      page,
      [{ id: 'e1', date: '2026-06-01', text: '' }],
      { latitude: 47.6062, longitude: -122.3321 },
    )
    await page.reload()
    await page.getByRole('button', { name: /Sync/ }).click()
    await page.getByTestId('sync-button').click()

    // Close the sheet mid-run
    await page.getByRole('button', { name: 'Done' }).click()

    // Reopen the sheet
    await page.getByRole('button', { name: /Sync/ }).click()

    // Button should still be disabled (isRunning() returns true)
    await expect(page.getByTestId('sync-button')).toBeDisabled()

    unblockFetch()
    await expect(page.getByTestId('sync-button')).not.toBeDisabled({ timeout: 10000 })
  })
})

// ── AC-16: Journal tab shows weather after sync ───────────────────────────────

test.describe('SyncSheet: Journal tab shows weather after sync', () => {
  test('weather icon appears on entry card after sync completes', async ({ page }) => {
    await page.route('**/archive-api.open-meteo.com/**', (route) =>
      route.fulfill({ json: WEATHER_MOCK }),
    )

    // Create entry via UI so it appears in the journal feed
    await page.goto(`${BASE}/journal/new/`)
    await page.getByPlaceholder('What happened in the garden today?').fill('My garden notes')
    await page.getByRole('button', { name: 'Save entry' }).click()
    await expect(page).toHaveURL(`${BASE}/journal/`)
    await page.getByTestId('loading').waitFor({ state: 'detached' })

    // Seed location settings
    await page.evaluate(() => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('garden-journal', 1)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('settings', 'readwrite')
          tx.objectStore('settings').put(
            {
              locationName: 'Seattle',
              lastFrostDate: null,
              latitude: 47.6062,
              longitude: -122.3321,
              aiProvider: '',
              aiModel: '',
              apiKeys: {},
            },
            'settings',
          )
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        }
        req.onerror = () => reject(req.error)
      })
    })

    // Open sync sheet and run sync
    await page.getByRole('button', { name: /Sync/ }).click()
    await page.getByTestId('sync-button').click()
    await expect(page.getByTestId('sync-summary')).toBeVisible({ timeout: 10000 })

    // Close the sheet
    await page.getByRole('button', { name: 'Done' }).click()

    // The journal feed should now show weather on the entry card
    await expect(page.getByText('My garden notes')).toBeVisible()
    // Weather icon should now be visible (☀️ for code 0)
    await expect(page.getByText('18°')).toBeVisible()
  })
})
