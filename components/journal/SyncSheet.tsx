'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getUnsyncedEntries, getSettings, updateJournalEntry } from '@/lib/db'
import type { JournalEntry, Settings } from '@/lib/db'
import { fetchWeatherForDate } from '@/lib/weatherSync'

interface Props {
  onClose: () => void
  onSynced: () => void
}

export default function SyncSheet({ onClose, onSynced }: Props) {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    Promise.all([getUnsyncedEntries(), getSettings()]).then(([es, s]) => {
      setEntries(es.sort((a, b) => b.date.localeCompare(a.date)))
      setSettings(s)
      setLoaded(true)
    })
  }, [])

  async function handleSync() {
    if (!settings?.latitude || !settings?.longitude) return
    setSyncing(true)
    setResult(null)

    let synced = 0
    for (const entry of entries) {
      const weather = await fetchWeatherForDate(entry.date, settings.latitude, settings.longitude)
      if (weather) {
        await updateJournalEntry({ ...entry, weatherC: weather.weatherC, weatherIcon: weather.weatherIcon })
        synced++
      }
    }

    setSyncing(false)
    setResult(`Weather synced for ${synced} of ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`)
    onSynced()
    const updated = await getUnsyncedEntries()
    setEntries(updated.sort((a, b) => b.date.localeCompare(a.date)))
  }

  const hasLocation = settings?.latitude != null && settings?.longitude != null

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
        ) : entries.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 px-4">
            <span className="text-4xl mb-3" aria-hidden>✓</span>
            <p className="text-sm text-muted">All entries are synced</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <p className="text-xs text-muted mb-3 uppercase tracking-wide font-semibold">
                {entries.length} {entries.length === 1 ? 'entry' : 'entries'} awaiting sync
              </p>
              <div className="space-y-2">
                {entries.map((entry) => {
                  const d = new Date(entry.date + 'T00:00:00')
                  const label = d.toLocaleDateString('en-GB', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                  return (
                    <div key={entry.id} className="bg-cream rounded-xl px-3 py-2.5">
                      <p className="text-xs font-semibold text-forest">{label}</p>
                      {entry.text ? (
                        <p className="text-xs text-muted mt-0.5 line-clamp-1">{entry.text}</p>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="px-4 pb-8 pt-3 border-t border-bone">
              {result && (
                <p className="text-xs text-muted mb-3 text-center">{result}</p>
              )}
              {!hasLocation ? (
                <p className="text-sm text-center text-muted">
                  Set your location in{' '}
                  <Link href="/settings" onClick={onClose} className="text-forest underline">
                    Settings
                  </Link>{' '}
                  to sync weather.
                </p>
              ) : (
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="w-full py-3.5 rounded-xl bg-forest text-cream font-medium text-sm active:opacity-80 disabled:opacity-50 transition-opacity"
                >
                  {syncing ? 'Syncing weather…' : 'Sync now'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
