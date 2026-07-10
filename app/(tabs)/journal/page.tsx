'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import CalendarStrip from '@/components/journal/CalendarStrip'
import EntryFeed from '@/components/journal/EntryFeed'
import { getEntriesByMonth, getEntryPhotosByEntry } from '@/lib/db'
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

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoaded(false)
      const es = await getEntriesByMonth(displayYear, displayMonth)
      if (cancelled) return
      setEntries(es)

      const map: Record<string, EntryPhoto[]> = {}
      await Promise.all(
        es.map(async (e) => {
          const photos = await getEntryPhotosByEntry(e.id)
          map[e.id] = photos
        }),
      )
      if (cancelled) return
      setPhotosByEntry(map)
      setLoaded(true)
    }

    load()
    return () => { cancelled = true }
  }, [displayYear, displayMonth])

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

  const entryDates = new Set(entries.map((e) => e.date))

  return (
    <div className="relative">
      {!loaded && <LoadingSpinner />}
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
  )
}
