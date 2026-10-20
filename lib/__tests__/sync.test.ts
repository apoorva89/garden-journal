import { describe, it, expect } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  openGardenDB,
  createJournalEntry,
  saveSettings,
} from '../db'
import type { Settings } from '../db'
import { runSync, isRunning } from '../sync'
import type { WeatherStatus, AIStatus } from '../sync'

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

    // AI calls: 'running' + terminal = 2 calls per entry (stub throws → 'running' then 'failed')
    const e1AICalls = calls.filter(([id, step]) => id === e1.id && step === 'ai')
    const e2AICalls = calls.filter(([id, step]) => id === e2.id && step === 'ai')
    expect(e1AICalls).toHaveLength(2)
    expect(e2AICalls).toHaveLength(2)
  })
})
