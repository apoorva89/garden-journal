'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import CalendarStrip from '@/components/journal/CalendarStrip'
import EntryFeed from '@/components/journal/EntryFeed'
import SyncSheet from '@/components/journal/SyncSheet'
import { getEntriesByMonth, getEntryPhotosByEntry, getUnsyncedEntries } from '@/lib/db'
import type { JournalEntry, EntryPhoto } from '@/lib/db'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function JournalPage() {
  const now = new Date()
  const [displayYear, setDisplayYear] = useState(now.getFullYear())
  const [displayMonth, setDisplayMonth] = useState(now.getMonth() + 1)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [photosByEntry, setPhotosByEntry] = useState<Record<string, EntryPhoto[]>>({})
  const [loaded, setLoaded] = useState(false)
  const [unsyncedCount, setUnsyncedCount] = useState(0)
  const [showSync, setShowSync] = useState(false)

  const loadMonth = useCallback(async (year: number, month: number) => {
    setLoaded(false)
    const es = await getEntriesByMonth(year, month)
    setEntries(es)
    const map: Record<string, EntryPhoto[]> = {}
    await Promise.all(
      es.map(async (e) => {
        const photos = await getEntryPhotosByEntry(e.id)
        map[e.id] = photos
      }),
    )
    setPhotosByEntry(map)
    setLoaded(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    loadMonth(displayYear, displayMonth).then(() => {
      if (!cancelled) getUnsyncedEntries().then((es) => setUnsyncedCount(es.length))
    })
    return () => { cancelled = true }
  }, [displayYear, displayMonth, loadMonth])

  function handleMonthChange(year: number, month: number) {
    setDisplayYear(year)
    setDisplayMonth(month)
    setSelectedDate(null)
  }

  function handleDateSelect(date: string) {
    setSelectedDate(date)
    const el = document.getElementById(`entry-${date}`)
    if (!el) return
    const cal = document.getElementById('calendar-strip')
    const offset = cal ? cal.offsetHeight : 0
    const y = el.getBoundingClientRect().top + window.scrollY - offset
    window.scrollTo({ top: y, behavior: 'smooth' })
  }

  async function handleSynced() {
    const es = await getUnsyncedEntries()
    setUnsyncedCount(es.length)
    loadMonth(displayYear, displayMonth)
  }

  const entryDates = new Set(entries.map((e) => e.date))

  return (
    <>
      <div className="relative">
        {!loaded && <LoadingSpinner />}
        <header className="px-4 pt-12 pb-3 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-ink">Journal</h1>
          <button
            onClick={() => setShowSync(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-forest active:opacity-70"
            aria-label="Sync entries"
          >
            <span aria-hidden>⟳</span>
            <span>Sync</span>
            {unsyncedCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-terra text-surface text-[10px] font-bold flex items-center justify-center">
                {unsyncedCount}
              </span>
            )}
          </button>
        </header>
        <CalendarStrip
          year={displayYear}
          month={displayMonth}
          entryDates={entryDates}
          selectedDate={selectedDate}
          onDateSelect={handleDateSelect}
          onMonthChange={handleMonthChange}
        />
        <EntryFeed entries={entries} photosByEntry={photosByEntry} />
        <Link
          href="/journal/new"
          onClick={(e) => {
            if (!navigator.onLine) {
              e.preventDefault();
              window.location.assign((e.currentTarget as HTMLAnchorElement).href);
            }
          }}
          className="fixed bottom-20 right-4 w-14 h-14 bg-terra rounded-full flex items-center justify-center text-surface text-3xl shadow-lg active:scale-95 transition-transform z-10"
          aria-label="New entry"
        >
          +
        </Link>
      </div>
      {showSync && (
        <SyncSheet
          onClose={() => setShowSync(false)}
          onSynced={handleSynced}
        />
      )}
    </>
  )
}
