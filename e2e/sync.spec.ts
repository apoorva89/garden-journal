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
  text?: string | null
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
              text: e.text !== undefined ? e.text : '',
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

// ── D-101: AI banner visibility gated on text entries ────────────────────────
// Both tests use identical settings (location set, AI not configured) so the
// contrast is purely due to whether any entry has text.

const AI_MISSING_SETTINGS = { latitude: 47.6062, longitude: -122.3321 }

test.describe('SyncSheet banner: AI missing — visible only when at least one entry has text (D-101)', () => {
  test('shows AI-missing banner when at least one entry has text', async ({ page }) => {
    await page.route('**/archive-api.open-meteo.com/**', (route) => route.fulfill({ json: WEATHER_MOCK }))
    await page.goto(`${BASE}/journal/`)
    await seedDb(
      page,
      [
        { id: 'e-text', date: '2026-06-01', text: 'Planted tomatoes' },
        { id: 'e-null', date: '2026-06-02', text: null },
      ],
      AI_MISSING_SETTINGS,
    )
    await page.reload()
    await page.getByRole('button', { name: /Sync/ }).click()
    await expect(page.getByTestId('missing-config-banner')).toContainText('AI not configured')
    await expect(page.getByTestId('ai-status-e-text')).toBeVisible()
    await expect(page.getByTestId('ai-status-e-text')).toHaveAttribute('aria-label', 'AI: pending')
  })

  test('hides AI-missing banner when all entries have no text (legacy text: null)', async ({ page }) => {
    await page.route('**/archive-api.open-meteo.com/**', (route) => route.fulfill({ json: WEATHER_MOCK }))
    await page.goto(`${BASE}/journal/`)
    await seedDb(
      page,
      [
        { id: 'e-null1', date: '2026-06-01', text: null },
        { id: 'e-null2', date: '2026-06-02', text: null },
      ],
      AI_MISSING_SETTINGS,
    )
    await page.reload()
    await page.getByRole('button', { name: /Sync/ }).click()
    await expect(page.getByTestId('missing-config-banner')).toHaveCount(0)
    await expect(page.locator('[data-date="2026-06-01"]')).toBeVisible()
    await expect(page.locator('[data-date="2026-06-02"]')).toBeVisible()
    await expect(page.getByTestId('weather-status-e-null1')).toHaveAttribute('aria-label', 'weather: pending')
    await expect(page.getByTestId('weather-status-e-null2')).toHaveAttribute('aria-label', 'weather: pending')
    await expect(page.locator('[data-testid^="ai-status-"]')).toHaveCount(0)
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

    const isoDates = await page.locator('[data-date]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-date')),
    )
    // All three entries present
    expect(isoDates).toHaveLength(3)
    // Ordering by ISO date string: oldest first
    expect(isoDates[0]).toBe('2026-06-01')
    expect(isoDates[1]).toBe('2026-06-10')
    expect(isoDates[2]).toBe('2026-06-20')
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

// ── TC-1: Reopen rebuilds rows from stored data (issue #49) ───────────────────

test.describe('SyncSheet reopen: persisted weather and AI state (issue #49 TC-1)', () => {
  test('weather shows synced and AI shows skipped on reopen after run with no AI config', async ({ page }) => {
    await page.route('**/archive-api.open-meteo.com/**', (route) => route.fulfill({ json: WEATHER_MOCK }))
    await page.goto(`${BASE}/journal/`)
    await seedDb(
      page,
      [
        { id: 'e-text', date: '2026-06-01', text: 'Planted tomatoes' },
        { id: 'e-no-text', date: '2026-06-02', text: null },
      ],
      { latitude: 47.6062, longitude: -122.3321 },  // no AI key
    )
    await page.reload()

    // Run full sync
    await page.getByRole('button', { name: /Sync/ }).click()
    await page.getByTestId('sync-button').click()
    await expect(page.getByTestId('sync-summary')).toBeVisible({ timeout: 10000 })

    // Close and reopen
    await page.getByRole('button', { name: 'Done' }).click()
    await page.getByRole('button', { name: /Sync/ }).click()

    // e-text: weather was synced, AI was skipped (no AI config)
    await expect(page.getByTestId('weather-status-e-text')).toHaveText('✓')
    await expect(page.getByTestId('weather-status-e-text')).toHaveAttribute('aria-label', 'weather: synced')
    await expect(page.getByTestId('ai-status-e-text')).toHaveText('–')
    await expect(page.getByTestId('ai-status-e-text')).toHaveAttribute('aria-label', 'AI: skipped')

    // e-no-text: entry was cleared from the unsynced list (applyNeedsSyncRule clears needsSync
    // when weatherC is set and there is no text), so it does not appear on reopen at all
    await expect(page.getByTestId('ai-status-e-no-text')).not.toBeVisible()
  })

  test('review-link is visible on reopen when PendingExtraction exists', async ({ page }) => {
    await page.route('**/archive-api.open-meteo.com/**', (route) => route.fulfill({ json: WEATHER_MOCK }))
    await page.goto(`${BASE}/journal/`)
    await seedDb(
      page,
      [{ id: 'e-with-extraction', date: '2026-06-01', text: 'Has extraction' }],
      {
        latitude: 47.6062,
        longitude: -122.3321,
        aiProvider: 'anthropic',
        aiModel: 'claude-sonnet-4-6',
        apiKey: 'sk-ant-test',
      },
    )
    await seedPendingExtraction(page, 'e-with-extraction')
    await page.reload()

    // Run full sync
    await page.getByRole('button', { name: /Sync/ }).click()
    await page.getByTestId('sync-button').click()
    await expect(page.getByTestId('sync-summary')).toBeVisible({ timeout: 10000 })

    // Close and reopen
    await page.getByRole('button', { name: 'Done' }).click()
    await page.getByRole('button', { name: /Sync/ }).click()

    // PendingExtraction persists across close/reopen — review-link should be shown
    await expect(page.getByTestId('review-link-e-with-extraction')).toBeVisible()
    await expect(page.getByTestId('review-link-e-with-extraction')).toContainText('Review')
  })
})

// ── Issue #51: flushSync oracle — per-step intermediate state ─────────────────

test.describe('SyncSheet: per-step intermediate state is visible during sync (issue #51)', () => {
  test('weather-status updates per entry, not all at once when runSync resolves', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Q-2: WebKit timing may be flaky for slow-fetch scenarios')

    let requestCount = 0
    await page.route('**/archive-api.open-meteo.com/**', async (route) => {
      if (requestCount++ === 0) {
        await route.fulfill({ json: WEATHER_MOCK })         // e1: resolves immediately
      } else {
        await new Promise<void>((r) => setTimeout(r, 3000)) // e2: 3-second delay
        await route.fulfill({ json: WEATHER_MOCK })
      }
    })

    await page.goto(`${BASE}/journal/`)
    await seedDb(
      page,
      [
        { id: 'e1', date: '2026-06-01', text: 'Entry one' },
        { id: 'e2', date: '2026-06-02', text: 'Entry two' },
      ],
      { latitude: 47.6062, longitude: -122.3321 },
    )
    await page.reload()
    await page.getByRole('button', { name: /Sync/ }).click()
    await page.getByTestId('sync-button').click()

    // e1 should finish and render before e2's 3-second delay expires
    await expect(page.getByTestId('weather-status-e1')).toHaveAttribute('aria-label', 'weather: synced')

    // e2 must still be mid-flight — without flushSync React batches both updates
    // and commits together when runSync resolves, at which point e2 is already synced
    await expect(page.getByTestId('weather-status-e2')).toHaveAttribute('aria-label', 'weather: fetching')

    await expect(page.getByTestId('sync-summary')).toBeVisible({ timeout: 10000 })
  })
})

// ── TC-2: Re-run: synced weather stays synced; no second weather request (issue #49) ─

test.describe('SyncSheet re-run: synced weather stays synced (issue #49 TC-2)', () => {
  test('second Sync Now leaves weather-status as ✓ and makes zero new weather requests', async ({ page }) => {
    let weatherCallCount = 0
    await page.route('**/archive-api.open-meteo.com/**', (route) => {
      weatherCallCount++
      return route.fulfill({ json: WEATHER_MOCK })
    })

    await page.goto(`${BASE}/journal/`)
    // Use a text entry so needsSync is NOT cleared after weather sync (stays in the unsynced
    // list for the second run, exercising the onProgress 'skipped' guard in handleSync)
    await seedDb(
      page,
      [{ id: 'e1', date: '2026-06-01', text: 'Entry that keeps needsSync after weather sync' }],
      { latitude: 47.6062, longitude: -122.3321 },
    )
    await page.reload()
    await page.getByRole('button', { name: /Sync/ }).click()

    // First sync: weather is fetched once
    await page.getByTestId('sync-button').click()
    await expect(page.getByTestId('sync-summary')).toContainText('Weather: 1 synced', { timeout: 10000 })
    expect(weatherCallCount).toBe(1)

    // Second sync: no close/reopen — press Sync Now again
    await page.getByTestId('sync-button').click()
    await expect(page.getByTestId('sync-summary')).toContainText('Weather: no updates needed', { timeout: 10000 })

    // Regression guard: synced weather must not flip to '–'
    await expect(page.getByTestId('weather-status-e1')).toHaveText('✓')

    // The orchestrator skips already-synced entries — no second weather request should be made
    expect(weatherCallCount).toBe(1)
  })
})
