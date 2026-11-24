import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  openGardenDB,
  createJournalEntry,
  saveSettings,
  createCropType,
  createCropInstance,
  createCropEvent,
  getUnsyncedEntries,
  getPendingExtractionByEntryId,
} from '../db'
import { getProvider } from '../ai/provider'
import type { AIProvider, RawExtractionResult } from '../ai/provider'
import type { Settings } from '../db'
import { runSync, isRunning } from '../sync'
import type { WeatherStatus, AIStatus } from '../sync'

vi.mock('../ai/provider', async importOriginal => ({
  ...await importOriginal<typeof import('../ai/provider')>(),
  getProvider: vi.fn(),
}))

const extract = vi.fn<AIProvider['extract']>()
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getProvider).mockReturnValue({ extract })
  extract.mockRejectedValue(new Error('Transport failed'))
})

type WeatherResult = { weatherC: number; weatherIcon: string }

function freshDb() {
  return openGardenDB(new IDBFactory())
}

const baseSettings: Settings = {
  locationName: 'Seattle',
  lastFrostDate: null,
  latitude: 47.6062,
  longitude: -122.3321,
  aiProvider: 'anthropic',
  aiModel: 'claude-sonnet-4-6',
  apiKeys: { anthropic: 'sk-ant-test' },
}

function noLocation(): Settings {
  return { ...baseSettings, latitude: null, longitude: null, locationName: '' }
}

function noAIConfig(): Settings {
  return { ...baseSettings, aiProvider: '', aiModel: '', apiKeys: {} }
}

type ProgressCall = [string, 'weather' | 'ai', WeatherStatus | AIStatus]

const successWeather = async (): Promise<WeatherResult | null> => ({ weatherC: 18, weatherIcon: '☀️' })
const failWeather = async (): Promise<WeatherResult | null> => null

// Returns the last progress status for a given entry+step (skipping 'fetching'/'running' if a terminal one exists)
function finalStatus(calls: ProgressCall[], entryId: string, step: 'weather' | 'ai'): WeatherStatus | AIStatus | undefined {
  const relevant = calls.filter(([id, s]) => id === entryId && s === step)
  return relevant.at(-1)?.[2]
}

// ── gate conditions ───────────────────────────────────────────────────────────

describe('runSync: gate conditions for weather and AI steps', () => {
  it('weather step runs only for entries with null weatherC and location configured', async () => {
    const db = await freshDb()
    await saveSettings(baseSettings, db)
    const withWeather = await createJournalEntry(
      { date: '2026-06-01', text: '', nextSeasonNote: '', weatherC: 15, weatherIcon: '☀️', photoIds: [], createdAt: '2026-06-01T10:00:00Z' },
      db,
    )
    const withoutWeather = await createJournalEntry(
      { date: '2026-06-02', text: '', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-02T10:00:00Z' },
      db,
    )

    const calls: ProgressCall[] = []
    await runSync({
      database: db,
      weatherFetcher: successWeather,
      onProgress: (id, step, status) => calls.push([id, step, status]),
    })

    expect(finalStatus(calls, withWeather.id, 'weather')).toBe('skipped')
    expect(finalStatus(calls, withoutWeather.id, 'weather')).toBe('synced')
  })

  it('AI step is invoked only for entries with non-empty text, no extractionReviewedAt, no existing PendingExtraction, and AI configured', async () => {
    const db = await freshDb()
    await saveSettings(baseSettings, db)

    const noText = await createJournalEntry(
      { date: '2026-06-01', text: '', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-01T10:00:00Z' },
      db,
    )
    const withText = await createJournalEntry(
      { date: '2026-06-02', text: 'Planted tomatoes', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-02T10:00:00Z' },
      db,
    )

    const calls: ProgressCall[] = []
    await runSync({
      database: db,
      weatherFetcher: successWeather,
      onProgress: (id, step, status) => calls.push([id, step, status]),
    })

    const noTextAI = calls.filter(([id, step]) => id === noText.id && step === 'ai')
    expect(noTextAI).toHaveLength(0) // no AI column for no-text entries

    const withTextAI = calls.filter(([id, step]) => id === withText.id && step === 'ai')
    expect(withTextAI.length).toBeGreaterThan(0) // AI step ran
  })

  it('AI step is skipped when extractionReviewedAt is set', async () => {
    const db = await freshDb()
    await saveSettings(baseSettings, db)
    const entry = await createJournalEntry(
      { date: '2026-06-01', text: 'Planted tomatoes', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-01T10:00:00Z', extractionReviewedAt: '2026-06-01T11:00:00Z' },
      db,
    )

    const calls: ProgressCall[] = []
    await runSync({
      database: db,
      weatherFetcher: successWeather,
      onProgress: (id, step, status) => calls.push([id, step, status]),
    })

    expect(finalStatus(calls, entry.id, 'ai')).toBe('skipped')
  })

  it('AI step is skipped when a PendingExtraction already exists', async () => {
    const db = await freshDb()
    await saveSettings(baseSettings, db)
    const entry = await createJournalEntry(
      { date: '2026-06-01', text: 'Planted tomatoes', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-01T10:00:00Z' },
      db,
    )
    await db.put('pendingExtractions', {
      entryId: entry.id,
      events: [],
      usage: { inputTokens: 100, outputTokens: 50 },
      createdAt: '2026-06-01T11:00:00Z',
    })

    const calls: ProgressCall[] = []
    await runSync({
      database: db,
      weatherFetcher: successWeather,
      onProgress: (id, step, status) => calls.push([id, step, status]),
    })

    expect(finalStatus(calls, entry.id, 'ai')).toBe('skipped')
  })
})

// ── failed weather ────────────────────────────────────────────────────────────

describe('runSync: failed weather does not stop run or AI step', () => {
  it('AI step runs even when weather fetch returns null', async () => {
    const db = await freshDb()
    await saveSettings(baseSettings, db)
    const entry = await createJournalEntry(
      { date: '2026-06-01', text: 'Some text', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-01T10:00:00Z' },
      db,
    )

    const calls: ProgressCall[] = []
    await runSync({
      database: db,
      weatherFetcher: failWeather,
      onProgress: (id, step, status) => calls.push([id, step, status]),
    })

    expect(finalStatus(calls, entry.id, 'weather')).toBe('failed')
    expect(finalStatus(calls, entry.id, 'ai')).toBeDefined()
    // AC-2: needsSync stays set when weather failed (weatherC still null)
    const stored = await db.get('journalEntries', entry.id)
    expect(stored!.needsSync).toBe(1)
  })

  it('run continues to next entry after a weather failure', async () => {
    const db = await freshDb()
    await saveSettings(baseSettings, db)
    await createJournalEntry(
      { date: '2026-06-01', text: '', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-01T10:00:00Z' },
      db,
    )
    await createJournalEntry(
      { date: '2026-06-02', text: '', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-02T10:00:00Z' },
      db,
    )

    let callCount = 0
    const alternateFetcher = async (): Promise<WeatherResult | null> => {
      callCount++
      return callCount === 1 ? null : { weatherC: 20, weatherIcon: '☀️' }
    }

    const calls: ProgressCall[] = []
    await runSync({
      database: db,
      weatherFetcher: alternateFetcher,
      onProgress: (id, step, status) => calls.push([id, step, status]),
    })

    // Order is not guaranteed by IDB — assert that BOTH entries were processed
    const weatherFinals = calls.filter(([, step, s]) => step === 'weather' && s !== 'fetching').map(([, , s]) => s)
    expect(weatherFinals).toContain('failed')
    expect(weatherFinals).toContain('synced')
    expect(callCount).toBe(2) // both entries were fetched
  })
})

// ── missing AI config ─────────────────────────────────────────────────────────

describe('runSync: missing AI config skips AI step, weather still runs', () => {
  it('weather runs and AI is skipped for all text entries when AI not configured', async () => {
    const db = await freshDb()
    await saveSettings(noAIConfig(), db)
    const entry = await createJournalEntry(
      { date: '2026-06-01', text: 'Planted beans', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-01T10:00:00Z' },
      db,
    )

    const calls: ProgressCall[] = []
    await runSync({
      database: db,
      weatherFetcher: successWeather,
      onProgress: (id, step, status) => calls.push([id, step, status]),
    })

    expect(finalStatus(calls, entry.id, 'weather')).toBe('synced')
    expect(finalStatus(calls, entry.id, 'ai')).toBe('skipped')
  })
})

// ── missing coordinates ───────────────────────────────────────────────────────

describe('runSync: missing coordinates skip weather step', () => {
  it('weather is skipped and AI still runs when no coordinates', async () => {
    const db = await freshDb()
    await saveSettings(noLocation(), db)
    const entry = await createJournalEntry(
      { date: '2026-06-01', text: 'Planted beans', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-01T10:00:00Z' },
      db,
    )

    const calls: ProgressCall[] = []
    await runSync({
      database: db,
      weatherFetcher: successWeather,
      onProgress: (id, step, status) => calls.push([id, step, status]),
    })

    expect(finalStatus(calls, entry.id, 'weather')).toBe('skipped')
    const aiCalls = calls.filter(([id, step]) => id === entry.id && step === 'ai')
    expect(aiCalls.length).toBeGreaterThan(0) // AI still ran
  })
})

// ── in-flight guard ───────────────────────────────────────────────────────────

describe('runSync: in-flight guard blocks concurrent run', () => {
  it('second call returns without starting a run while first is in progress', async () => {
    const db = await freshDb()
    await saveSettings(baseSettings, db)
    await createJournalEntry(
      { date: '2026-06-01', text: '', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-01T10:00:00Z' },
      db,
    )

    // Create a slow fetcher that signals when it has been invoked
    let resolveWeather: ((val: WeatherResult | null) => void) | undefined
    let notifyFetcherCalled!: () => void
    const fetcherCalledPromise = new Promise<void>((resolve) => { notifyFetcherCalled = resolve })

    const slowFetcher = (): Promise<WeatherResult | null> =>
      new Promise<WeatherResult | null>((resolve) => {
        resolveWeather = resolve
        notifyFetcherCalled()
      })

    const progress2: ProgressCall[] = []

    const run1 = runSync({
      database: db,
      weatherFetcher: slowFetcher,
      onProgress: () => {},
    })

    const run2 = runSync({
      database: db,
      weatherFetcher: slowFetcher,
      onProgress: (id, step, status) => progress2.push([id, step, status]),
    })

    expect(isRunning()).toBe(true)

    // Wait for the slow fetcher to actually be invoked before resolving it
    await fetcherCalledPromise
    resolveWeather!({ weatherC: 18, weatherIcon: '☀️' })
    await Promise.all([run1, run2])

    expect(isRunning()).toBe(false)
    expect(progress2).toHaveLength(0) // second run was blocked entirely
  })
})

// ── failed AI does not stop run ───────────────────────────────────────────────

describe('runSync: failed AI step does not stop run or weather step', () => {
  it('weather runs and next entries are processed after AI failure', async () => {
    const db = await freshDb()
    await saveSettings(baseSettings, db)
    const e1 = await createJournalEntry(
      { date: '2026-06-01', text: 'Entry one', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-01T10:00:00Z' },
      db,
    )
    const e2 = await createJournalEntry(
      { date: '2026-06-02', text: 'Entry two', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-02T10:00:00Z' },
      db,
    )

    const calls: ProgressCall[] = []
    await runSync({
      database: db,
      weatherFetcher: successWeather,
      onProgress: (id, step, status) => calls.push([id, step, status]),
    })

    expect(finalStatus(calls, e1.id, 'weather')).toBeDefined()
    expect(finalStatus(calls, e1.id, 'ai')).toBe('failed')
    expect(finalStatus(calls, e2.id, 'weather')).toBeDefined()
    expect(finalStatus(calls, e2.id, 'ai')).toBe('failed')
    // AC-17: needsSync stays set on text entries when AI failed (no extractionReviewedAt)
    const storedE1 = await db.get('journalEntries', e1.id)
    const storedE2 = await db.get('journalEntries', e2.id)
    expect(storedE1!.needsSync).toBe(1)
    expect(storedE2!.needsSync).toBe(1)
  })
})

// ── each step called exactly once per eligible entry ─────────────────────────

describe('runSync: each step called exactly once per eligible entry', () => {
  it('weather and AI each called exactly once per eligible entry', async () => {
    const db = await freshDb()
    await saveSettings(baseSettings, db)
    const e1 = await createJournalEntry(
      { date: '2026-06-01', text: 'Planted beans', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-01T10:00:00Z' },
      db,
    )
    const e2 = await createJournalEntry(
      { date: '2026-06-02', text: 'Watered beds', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-02T10:00:00Z' },
      db,
    )

    const calls: ProgressCall[] = []
    await runSync({
      database: db,
      weatherFetcher: successWeather,
      onProgress: (id, step, status) => calls.push([id, step, status]),
    })

    // Terminal weather calls (non-'fetching') - exactly one per entry
    const e1WeatherTerminal = calls.filter(([id, step, s]) => id === e1.id && step === 'weather' && s !== 'fetching')
    const e2WeatherTerminal = calls.filter(([id, step, s]) => id === e2.id && step === 'weather' && s !== 'fetching')
    expect(e1WeatherTerminal).toHaveLength(1)
    expect(e2WeatherTerminal).toHaveLength(1)

    // AI calls: 'running' + terminal = 2 calls per entry (fake provider throws → 'running' then 'failed')
    const e1AICalls = calls.filter(([id, step]) => id === e1.id && step === 'ai')
    const e2AICalls = calls.filter(([id, step]) => id === e2.id && step === 'ai')
    expect(e1AICalls).toHaveLength(2)
    expect(e2AICalls).toHaveLength(2)
  })
})

describe('runSync: persisting extraction', () => {
  const event = {
    eventType: 'fix',
    matchedRosterName: 'Tomato',
    linkedProblemRef: 'P1',
    notes: 'Removed damaged leaves',
    eventDate: null,
    nurseryName: null,
    variety: null,
  }
  const usage = { inputTokens: 24, outputTokens: 7 }
  const response = {
    events: [event, { ...event, matchedRosterName: 'Tomatto', linkedProblemRef: 'P9' }],
    usage: { ...usage, rawUsage: {} },
  }

  async function setup(settings = noLocation()) {
    const db = await freshDb()
    await saveSettings(settings, db)
    const entry = await createJournalEntry({
      date: '2026-06-01', text: event.notes, nextSeasonNote: '',
      weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-01T10:00:00Z',
    }, db)
    const calls: ProgressCall[] = []
    const sync = () => runSync({
      database: db,
      weatherFetcher: successWeather,
      onProgress: (id, step, status) => calls.push([id, step, status]),
    })
    return { db, entry, calls, sync }
  }

  it('saves one PendingExtraction with one pending review per event', async () => {
    const { db, entry, calls, sync } = await setup()
    extract.mockResolvedValueOnce(response)
    await sync()

    expect(await db.count('pendingExtractions')).toBe(1)
    const saved = await getPendingExtractionByEntryId(entry.id, db)
    expect(saved?.events.map(review => review.status)).toEqual(['pending', 'pending'])
    expect(finalStatus(calls, entry.id, 'ai')).toBe('review-pending')
    expect(extract).toHaveBeenCalledWith(expect.anything(), {
      model: baseSettings.aiModel, apiKey: baseSettings.apiKeys[baseSettings.aiProvider],
    })
    expect(await db.count('cropEvents')).toBe(0)
    expect(await db.count('generalNotes')).toBe(0)
  })

  it('stored reviews carry resolved IDs from roster and problems', async () => {
    const { db, entry, sync } = await setup()
    const crop = await createCropType({ name: 'Tomato', lessons: [] }, db)
    const instance = await createCropInstance({
      cropTypeId: crop.id, year: 2026, variety: '', source: { type: 'seed' }, createdAt: entry.createdAt,
    }, db)
    const problem = await createCropEvent({
      cropInstanceId: instance.id, date: entry.date, type: 'problem', notes: 'Damaged leaves',
      linkedProblemId: null, photos: [], weatherC: null, weatherIcon: null,
    }, db)
    extract.mockResolvedValueOnce(response)
    await sync()

    expect(extract).toHaveBeenCalledWith(expect.objectContaining({
      userMessage: expect.stringContaining('P1 (Tomato, 2026-06-01): Damaged leaves'),
    }), expect.anything())
    expect(extract.mock.calls[0][0].userMessage).not.toContain(problem.id)
    expect((await getPendingExtractionByEntryId(entry.id, db))?.events).toMatchObject([
      { resolvedCropTypeId: crop.id, resolvedLinkedProblemId: problem.id },
      { resolvedCropTypeId: null, resolvedLinkedProblemId: null },
    ])
  })

  it('PendingExtraction.usage sourced from the provider response', async () => {
    const { db, entry, sync } = await setup()
    extract.mockResolvedValueOnce(response)
    await sync()
    expect((await getPendingExtractionByEntryId(entry.id, db))?.usage).toEqual(usage)
    expect(await db.getAllFromIndex('apiUsageLogs', 'by-entryId', entry.id)).toMatchObject([usage])
  })

  it('transport failure saves nothing and leaves entry unsynced', async () => {
    const { db, entry, calls, sync } = await setup()
    await sync()
    expect(await db.count('pendingExtractions')).toBe(0)
    expect(await db.count('apiUsageLogs')).toBe(0)
    expect(await getUnsyncedEntries(db)).toEqual([entry])
    expect(finalStatus(calls, entry.id, 'ai')).toBe('failed')
    expect(extract).toHaveBeenCalledTimes(1)
  })

  it('billed-but-invalid logs one usage and saves no extraction', async () => {
    const { db, entry, calls, sync } = await setup()
    extract.mockResolvedValueOnce({ ...response, events: [{ eventType: 'invalid' }] })
    await sync()
    expect(await db.count('pendingExtractions')).toBe(0)
    expect(await db.getAll('apiUsageLogs')).toMatchObject([{ entryId: entry.id, ...usage }])
    expect(await getUnsyncedEntries(db)).toEqual([entry])
    expect(finalStatus(calls, entry.id, 'ai')).toBe('failed')
    expect(extract).toHaveBeenCalledTimes(1)
  })

  it('next sync retries after a failed extraction', async () => {
    const { db, entry, sync } = await setup()
    await sync()
    expect(await db.count('pendingExtractions')).toBe(0)
    extract.mockResolvedValueOnce(response)
    await sync()
    expect(extract).toHaveBeenCalledTimes(2)
    expect(await db.count('pendingExtractions')).toBe(1)
    expect(await getPendingExtractionByEntryId(entry.id, db)).toBeDefined()
  })

  it('existing PendingExtraction skips AI with no new usage log', async () => {
    const { db, sync } = await setup()
    extract.mockResolvedValueOnce(response)
    await sync()
    expect(await db.count('pendingExtractions')).toBe(1)
    const logs = await db.getAll('apiUsageLogs')
    expect(logs).toHaveLength(1)
    extract.mockClear()
    await sync()
    expect(extract).not.toHaveBeenCalled()
    expect(await db.getAll('apiUsageLogs')).toEqual(logs)
  })

  it('weather is written even when extraction fails', async () => {
    const { db, entry, calls, sync } = await setup(baseSettings)
    await sync()
    expect((await db.get('journalEntries', entry.id))?.weatherC).toBe(18)
    expect(finalStatus(calls, entry.id, 'ai')).toBe('failed')
    expect(extract).toHaveBeenCalledTimes(1)
  })

  it('in-flight guard prevents a second extraction for the entry', async () => {
    const { db, sync } = await setup()
    let finish!: (result: RawExtractionResult) => void
    const responsePromise = new Promise<RawExtractionResult>(resolve => { finish = resolve })
    extract.mockReturnValueOnce(responsePromise)
    const firstSync = sync()
    try {
      await vi.waitFor(() => expect(extract).toHaveBeenCalledTimes(1))
      await sync()
      expect(extract).toHaveBeenCalledTimes(1)
    } finally {
      finish(response)
      await firstSync
    }
    expect(await db.count('pendingExtractions')).toBe(1)
  })

  it('one usage log per successful extraction', async () => {
    const { db, entry, calls, sync } = await setup()
    extract.mockResolvedValueOnce(response)
    await sync()
    expect(finalStatus(calls, entry.id, 'ai')).toBe('review-pending')
    expect(await db.getAll('apiUsageLogs')).toMatchObject([{ entryId: entry.id }])
  })

  it('valid events without usage save a review without a usage log', async () => {
    const { db, entry, calls, sync } = await setup()
    extract.mockResolvedValueOnce({ events: [event], usage: null })
    await sync()
    expect(await getPendingExtractionByEntryId(entry.id, db)).toMatchObject({
      usage: null,
      events: [{ status: 'pending', extracted: event }],
    })
    expect(await db.count('apiUsageLogs')).toBe(0)
    expect(finalStatus(calls, entry.id, 'ai')).toBe('review-pending')
  })
})
