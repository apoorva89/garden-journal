'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { JournalEntry, EntryPhoto } from '@/lib/db'

function PhotoGrid({ photos }: { photos: EntryPhoto[] }) {
  if (photos.length === 0) return null

  if (photos.length === 1) {
    return (
      <div className="rounded-xl overflow-hidden" style={{ height: 240 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photos[0].dataUrl} alt="" className="w-full h-full object-cover" />
      </div>
    )
  }

  if (photos.length === 2) {
    return (
      <div className="flex gap-1 rounded-xl overflow-hidden" style={{ height: 180 }}>
        {photos.map((p) => (
          <div key={p.id} className="flex-1 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.dataUrl} alt="" className="w-full h-full object-cover" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-1 rounded-xl overflow-hidden" style={{ height: 240 }}>
      <div className="flex-1 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photos[0].dataUrl} alt="" className="w-full h-full object-cover" />
      </div>
      <div className="flex flex-col gap-1 overflow-hidden" style={{ width: '38%' }}>
        {photos.slice(1, 3).map((p) => (
          <div key={p.id} className="flex-1 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.dataUrl} alt="" className="w-full h-full object-cover" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function EntryDetail() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = searchParams.get('id')

  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [photos, setPhotos] = useState<EntryPhoto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) { router.replace('/journal'); return }
    async function load() {
      const { getJournalEntryById, getEntryPhotosByEntry } = await import('@/lib/db')
      const e = await getJournalEntryById(id!)
      if (!e) { router.replace('/journal'); return }
      const ps = await getEntryPhotosByEntry(id!)
      setEntry(e)
      setPhotos(ps)
      setLoading(false)
    }
    load()
  }, [id, router])

  if (loading || !entry) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-cream text-mushroom text-sm">
        Loading…
      </div>
    )
  }

  const d = new Date(entry.date + 'T00:00:00')
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' })
  const day = d.getDate()
  const monthName = d.toLocaleDateString('en-GB', { month: 'long' })
  const year = d.getFullYear()

  return (
    <div className="min-h-screen bg-cream pb-8">
      <div className="bg-surface border-b border-bone px-4 pt-12 pb-4 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-8 h-8 flex items-center justify-center text-forest text-xl flex-none"
          aria-label="Back"
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold tracking-widest uppercase text-forest leading-tight">
            {weekday}, {day} {monthName} {year}
          </p>
          {entry.needsSync === 1 && (
            <span className="inline-block mt-0.5 text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
              Awaiting sync
            </span>
          )}
        </div>
        {entry.weatherIcon != null && entry.weatherC != null && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-weather text-muted flex-none">
            {entry.weatherIcon} {entry.weatherC}°C
          </span>
        )}
      </div>

      <div className="px-4 pt-5 space-y-5">
        {entry.text ? (
          <p className="text-sm text-ink leading-relaxed">{entry.text}</p>
        ) : (
          <p className="text-sm text-mushroom italic">No notes for this entry.</p>
        )}

        <PhotoGrid photos={photos} />

        {entry.nextSeasonNote ? (
          <div
            className="bg-surface rounded-2xl p-4"
            style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
          >
            <p className="text-[11px] font-bold tracking-widest uppercase text-forest mb-2">
              Notes for next season
            </p>
            <p className="text-sm text-ink leading-relaxed">{entry.nextSeasonNote}</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
