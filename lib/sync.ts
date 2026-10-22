import {
  getUnsyncedEntries,
  getSettings,
  writeEntryWeather,
  getPendingExtractionByEntryId,
} from './db'
import type { GardenDB } from './db'
import type { WeatherResult } from './weatherSync'
import { fetchWeatherForDate } from './weatherSync'
import type { AIProvider } from './ai/provider'
import { StubAIProvider } from './ai/provider'

export type WeatherStatus = 'pending' | 'fetching' | 'synced' | 'failed' | 'skipped'
export type AIStatus = 'pending' | 'running' | 'failed' | 'review-pending' | 'skipped'

export interface SyncOptions {
  weatherFetcher?: (date: string, lat: number, lon: number) => Promise<WeatherResult | null>
  aiProvider?: AIProvider
  onProgress?: (entryId: string, step: 'weather' | 'ai', status: WeatherStatus | AIStatus) => void
  database?: GardenDB
}

let running = false

export function isRunning(): boolean {
  return running
}

export async function runSync(options: SyncOptions = {}): Promise<void> {
  if (running) return
  running = true
  try {
    await _runSync(options)
  } finally {
    running = false
  }
}

async function _runSync({
  weatherFetcher = fetchWeatherForDate,
  aiProvider = new StubAIProvider(),
  onProgress,
  database,
}: SyncOptions): Promise<void> {
  const [entries, settings] = await Promise.all([
    getUnsyncedEntries(database),
    getSettings(database),
  ])

  const hasLocation = settings?.latitude != null && settings?.longitude != null
  const aiKey = settings?.aiProvider
    ? settings.apiKeys[settings.aiProvider as keyof typeof settings.apiKeys]
    : undefined
  const hasAIConfig = !!(settings?.aiProvider && settings?.aiModel && aiKey)

  for (const entry of entries) {
    // ── Weather step ─────────────────────────────────────────────────────────
    if (!hasLocation || entry.weatherC != null) {
      onProgress?.(entry.id, 'weather', 'skipped')
    } else {
      onProgress?.(entry.id, 'weather', 'fetching')
      try {
        const weather = await weatherFetcher(entry.date, settings!.latitude!, settings!.longitude!)
        if (weather) {
          await writeEntryWeather(entry.id, weather, database)
          onProgress?.(entry.id, 'weather', 'synced')
        } else {
          onProgress?.(entry.id, 'weather', 'failed')
        }
      } catch {
        onProgress?.(entry.id, 'weather', 'failed')
      }
    }

    // ── AI step (text entries only) ──────────────────────────────────────────
    const hasText = !!(entry.text && entry.text.trim() !== '')
    if (!hasText) continue // No AI column for text-less entries; no onProgress call

    if (!hasAIConfig || !!entry.extractionReviewedAt) {
      onProgress?.(entry.id, 'ai', 'skipped')
    } else {
      const existing = await getPendingExtractionByEntryId(entry.id, database)
      if (existing) {
        onProgress?.(entry.id, 'ai', 'skipped')
      } else {
        onProgress?.(entry.id, 'ai', 'running')
        try {
          await aiProvider.extract(entry.text, [], [])
          // Reached only if real provider is wired (8d-2+). Stub always throws.
          onProgress?.(entry.id, 'ai', 'review-pending')
        } catch {
          onProgress?.(entry.id, 'ai', 'failed')
        }
      }
    }
  }
}
