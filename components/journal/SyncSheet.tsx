'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getUnsyncedEntries, getSettings, getPendingExtractionByEntryId } from '@/lib/db'
import type { JournalEntry, Settings } from '@/lib/db'
import { runSync, isRunning } from '@/lib/sync'
import type { WeatherStatus, AIStatus } from '@/lib/sync'

interface RowState {
  entry: JournalEntry
  weatherStatus: WeatherStatus
  /** null = no AI column (entry has no text) */
  aiStatus: AIStatus | null
  hasPendingExtraction: boolean
}

interface SyncSummary {
  weatherSynced: number
  weatherFailed: number
  weatherSkipped: number
  aiQueued: number
  aiFailed: number
  aiSkipped: number
}

interface Props {
  onClose: () => void
  onSynced: () => void
}

const WEATHER_LABEL: Record<WeatherStatus, string> = {
  pending: '—',
  fetching: '…',
  synced: '✓',
  failed: '✗',
  skipped: '–',
}

const AI_LABEL: Record<AIStatus, string> = {
  pending: '—',
  running: '…',
  failed: '✗',
  'review-pending': '⊙',
  skipped: '–',
}

export default function SyncSheet({ onClose, onSynced }: Props) {
  const [rows, setRows] = useState<RowState[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [syncing, setSyncing] = useState(isRunning())
  const [summary, setSummary] = useState<SyncSummary | null>(null)
  const [loaded, setLoaded] = useState(false)

  // When the sheet opens while a run is in progress, poll until it finishes
  useEffect(() => {
    if (!syncing) return
    const interval = setInterval(() => {
      if (!isRunning()) setSyncing(false)
    }, 200)
    return () => clearInterval(interval)
  }, [syncing])

  useEffect(() => {
    async function load() {
      const [entries, s] = await Promise.all([getUnsyncedEntries(), getSettings()])
      // oldest-first
      const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
      const initial: RowState[] = await Promise.all(
        sorted.map(async (entry) => {
          const pending = await getPendingExtractionByEntryId(entry.id)
          return {
            entry,
            weatherStatus: 'pending' as WeatherStatus,
            aiStatus: (entry.text.trim() ? 'pending' : null) as AIStatus | null,
            hasPendingExtraction: !!pending,
          }
        }),
      )
      setRows(initial)
      setSettings(s)
      setLoaded(true)
    }
    load()
  }, [])

  async function handleSync() {
    setSyncing(true)
    setSummary(null)

    type ProgressEntry = [string, 'weather' | 'ai', WeatherStatus | AIStatus]
    const log: ProgressEntry[] = []

    await runSync({
      onProgress(entryId, step, status) {
        log.push([entryId, step, status])
        setRows((prev) =>
          prev.map((row) => {
            if (row.entry.id !== entryId) return row
            if (step === 'weather') return { ...row, weatherStatus: status as WeatherStatus }
            return { ...row, aiStatus: status as AIStatus }
          }),
        )
      },
    })

    // Compute post-run summary
    const newSummary: SyncSummary = { weatherSynced: 0, weatherFailed: 0, weatherSkipped: 0, aiQueued: 0, aiFailed: 0, aiSkipped: 0 }
    for (const [, step, status] of log) {
      if (step === 'weather') {
        if (status === 'synced') newSummary.weatherSynced++
        else if (status === 'failed') newSummary.weatherFailed++
        else if (status === 'skipped') newSummary.weatherSkipped++
      } else {
        if (status === 'review-pending') newSummary.aiQueued++
        else if (status === 'failed') newSummary.aiFailed++
        else if (status === 'skipped') newSummary.aiSkipped++
      }
    }

    // Re-read PendingExtractions after the run (future phases may create them)
    const entryIds = rows.map((r) => r.entry.id)
    const pendingMap: Record<string, boolean> = {}
    await Promise.all(
      entryIds.map(async (id) => {
        pendingMap[id] = !!(await getPendingExtractionByEntryId(id))
      }),
    )
    setRows((prev) => prev.map((row) => ({ ...row, hasPendingExtraction: pendingMap[row.entry.id] ?? row.hasPendingExtraction })))

    setSyncing(false)
    setSummary(newSummary)
    onSynced()
  }

  const hasLocation = settings?.latitude != null && settings?.longitude != null
  const aiKey = settings?.aiProvider
    ? settings.apiKeys[settings.aiProvider as keyof typeof settings.apiKeys]
    : undefined
  const hasAIConfig = !!(settings?.aiProvider && settings?.aiModel && aiKey)
  const missingLocation = loaded && !hasLocation
  const missingAI = loaded && !hasAIConfig

  const totalEntries = rows.length

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-surface rounded-t-2xl max-h-[80vh] flex flex-col"
        style={{ boxShadow: '0 -2px 20px rgba(0,0,0,0.12)' }}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-bone" />
        </div>

        <div className="px-4 pb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Sync</h2>
          <button onClick={onClose} className="text-sm text-muted">Done</button>
        </div>

        {!loaded ? (
          <div className="flex-1 flex items-center justify-center py-8">
            <p className="text-sm text-muted">Loading…</p>
          </div>
        ) : totalEntries === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 px-4">
            <span className="text-4xl mb-3" aria-hidden>✓</span>
            <p className="text-sm text-muted">All entries are synced</p>
          </div>
        ) : (
          <>
            {/* Missing config banner */}
            {(missingLocation || missingAI) && (
              <div className="mx-4 mb-3 px-3 py-2.5 bg-bone rounded-xl text-xs text-muted" data-testid="missing-config-banner">
                {missingLocation && missingAI
                  ? 'Location and AI config missing. '
                  : missingLocation
                  ? 'Location not set. '
                  : 'AI not configured. '}
                Set up in{' '}
                <Link href="/settings" onClick={onClose} className="text-forest underline">
                  Settings
                </Link>
                .
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <p className="text-xs text-muted mb-3 uppercase tracking-wide font-semibold">
                {totalEntries} {totalEntries === 1 ? 'entry' : 'entries'} awaiting sync
              </p>

              {/* Column headers */}
              <div className="flex items-center gap-2 px-3 mb-1">
                <p className="flex-1 text-xs font-semibold text-muted uppercase tracking-wide">Entry</p>
                <p className="w-16 text-center text-xs font-semibold text-muted uppercase tracking-wide">Weather</p>
                <p className="w-12 text-center text-xs font-semibold text-muted uppercase tracking-wide">AI</p>
              </div>

              <div className="space-y-2">
                {rows.map((row) => {
                  const d = new Date(row.entry.date + 'T00:00:00')
                  const label = d.toLocaleDateString('en-GB', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                  return (
                    <div key={row.entry.id} className="bg-cream rounded-xl px-3 py-2.5 flex items-center gap-2" data-date={row.entry.date}>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-forest">{label}</p>
                        {row.entry.text ? (
                          <p className="text-xs text-muted mt-0.5 line-clamp-1">{row.entry.text}</p>
                        ) : null}
                      </div>

                      {/* Weather state */}
                      <div className="w-16 flex justify-center">
                        <span
                          className={`text-xs font-mono ${row.weatherStatus === 'synced' ? 'text-forest' : row.weatherStatus === 'failed' ? 'text-red-500' : 'text-muted'}`}
                          data-testid={`weather-status-${row.entry.id}`}
                          aria-label={`weather: ${row.weatherStatus}`}
                        >
                          {WEATHER_LABEL[row.weatherStatus]}
                        </span>
                      </div>

                      {/* AI state (only for text entries) */}
                      <div className="w-12 flex justify-center">
                        {row.aiStatus !== null ? (
                          row.hasPendingExtraction ? (
                            <Link
                              href={`/journal/sync/${row.entry.id}/`}
                              className="text-xs text-forest font-medium"
                              data-testid={`review-link-${row.entry.id}`}
                            >
                              Review →
                            </Link>
                          ) : (
                            <span
                              className={`text-xs font-mono ${row.aiStatus === 'review-pending' ? 'text-forest' : row.aiStatus === 'failed' ? 'text-red-500' : 'text-muted'}`}
                              data-testid={`ai-status-${row.entry.id}`}
                              aria-label={`AI: ${row.aiStatus}`}
                            >
                              {AI_LABEL[row.aiStatus]}
                            </span>
                          )
                        ) : (
                          <span className="w-12" aria-hidden />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="px-4 pb-8 pt-3 border-t border-bone">
              {/* Post-run summary */}
              {summary && (
                <div className="mb-3 text-xs text-muted space-y-0.5" data-testid="sync-summary">
                  <p>
                    Weather: {summary.weatherSynced} synced, {summary.weatherFailed} failed, {summary.weatherSkipped} skipped
                  </p>
                  <p>
                    AI: {summary.aiQueued} queued, {summary.aiFailed} failed, {summary.aiSkipped} skipped
                  </p>
                </div>
              )}

              <button
                onClick={handleSync}
                disabled={syncing}
                className="w-full py-3.5 rounded-xl bg-forest text-cream font-medium text-sm active:opacity-80 disabled:opacity-50 transition-opacity"
                data-testid="sync-button"
              >
                {syncing ? 'Syncing…' : 'Sync Now'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
