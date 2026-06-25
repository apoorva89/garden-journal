'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import CropTagSheet from '@/components/journal/CropTagSheet'

function todayStr(): string {
  const d = new Date()
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

async function resizeToDataUrl(file: File, maxPx = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const { width, height } = img
      const scale = Math.min(1, maxPx / Math.max(width, height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = reject
    img.src = url
  })
}

interface LocalPhoto {
  dataUrl: string
  label: string
  cropTypeIds: string[]
}

export default function NewEntryPage() {
  const router = useRouter()
  const [date, setDate] = useState(todayStr)
  const [text, setText] = useState('')
  const [nextSeasonNote, setNextSeasonNote] = useState('')
  const [nextSeasonOpen, setNextSeasonOpen] = useState(false)
  const [photos, setPhotos] = useState<LocalPhoto[]>([])
  const [tagSheetIndex, setTagSheetIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      if (files.length === 0) return
      const base = photos.length
      const newPhotos = await Promise.all(
        files.map(async (file, i) => ({
          dataUrl: await resizeToDataUrl(file),
          label: `Photo ${base + i + 1}`,
          cropTypeIds: [] as string[],
        })),
      )
      setPhotos((prev) => [...prev, ...newPhotos])
      e.target.value = ''
    },
    [photos.length],
  )

  const updateCropTags = useCallback((idx: number, cropTypeIds: string[]) => {
    setPhotos((prev) => prev.map((p, i) => (i === idx ? { ...p, cropTypeIds } : p)))
  }, [])

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      const { createEntryPhoto, createJournalEntry, updateJournalEntry } = await import('@/lib/db')
      const now = new Date().toISOString()

      const entry = await createJournalEntry({
        date,
        text,
        nextSeasonNote,
        weatherC: null,
        weatherIcon: null,
        photoIds: [],
        createdAt: now,
      })

      const photoIds: string[] = []
      for (const photo of photos) {
        const ep = await createEntryPhoto({
          entryId: entry.id,
          dataUrl: photo.dataUrl,
          cropTypeIds: photo.cropTypeIds,
          createdAt: now,
        })
        photoIds.push(ep.id)
      }

      if (photoIds.length > 0) {
        await updateJournalEntry({ ...entry, photoIds })
      }

      router.push('/journal')
    } finally {
      setSaving(false)
    }
  }

  const d = new Date(date + 'T00:00:00')
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' })
  const day = d.getDate()
  const monthName = d.toLocaleDateString('en-GB', { month: 'long' })
  const year = d.getFullYear()

  return (
    <>
      <div className="pb-24 min-h-screen bg-cream">
        {/* Date header */}
        <div className="px-4 pt-5 pb-3">
          <div className="relative inline-flex items-center gap-1.5 text-[11px] font-bold tracking-widest uppercase text-forest">
            {weekday}, {day} {monthName} {year}
            <span className="text-[10px] text-mushroom normal-case tracking-normal font-normal">✎</span>
            <input
              type="date"
              value={date}
              max={todayStr()}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </div>
        </div>

        {/* Text area */}
        <div className="px-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What happened in the garden today?"
            autoFocus
            className="w-full bg-surface rounded-2xl p-4 text-sm text-ink leading-relaxed resize-none outline-none placeholder:text-mushroom"
            style={{ minHeight: 200, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
          />
        </div>

        {/* Photo strip */}
        <div className="px-4 mt-3">
          <div
            className="flex gap-2 overflow-x-auto pb-1"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
          >
            {photos.map((photo, i) => (
              <button
                key={i}
                onClick={() => setTagSheetIndex(i)}
                className="flex-none flex flex-col items-center gap-1 active:opacity-70"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.dataUrl}
                  alt={photo.label}
                  className="w-20 h-20 object-cover rounded-xl"
                />
                <span className="text-[10px] text-muted max-w-[5rem] truncate">{photo.label}</span>
                {photo.cropTypeIds.length > 0 && (
                  <span className="text-[9px] text-leaf font-semibold">
                    {photo.cropTypeIds.length} tagged
                  </span>
                )}
              </button>
            ))}

            <div className="relative flex-none w-20 h-20 rounded-xl border-2 border-dashed border-leaf flex items-center justify-center text-leaf text-3xl">
              +
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Notes for next season */}
        <div className="px-4 mt-4">
          <button
            onClick={() => setNextSeasonOpen((o) => !o)}
            className="flex items-center gap-2 text-sm font-semibold text-forest w-full py-1"
          >
            <span
              className="text-[10px] transition-transform duration-150"
              style={{ display: 'inline-block', transform: nextSeasonOpen ? 'rotate(90deg)' : 'none' }}
            >
              ▶
            </span>
            Notes for next season
          </button>
          {nextSeasonOpen && (
            <textarea
              value={nextSeasonNote}
              onChange={(e) => setNextSeasonNote(e.target.value)}
              placeholder="What would you do differently next year?"
              className="mt-2 w-full bg-surface rounded-2xl p-4 text-sm text-ink leading-relaxed resize-none outline-none placeholder:text-mushroom"
              style={{ minHeight: 120, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
            />
          )}
        </div>
      </div>

      {/* Pinned save bar — z-30 covers the TabBar (z-20) */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-surface border-t border-bone px-4 flex items-center gap-3 z-30"
        style={{
          paddingTop: '0.75rem',
          paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
        }}
      >
        <button
          onClick={() => router.back()}
          className="flex-1 h-11 rounded-full border border-bone text-sm font-medium text-mushroom active:opacity-70"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 h-11 rounded-full bg-leaf text-surface font-semibold text-sm active:opacity-80 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save entry'}
        </button>
      </div>

      {tagSheetIndex !== null && (
        <CropTagSheet
          photoLabel={photos[tagSheetIndex].label}
          selectedIds={photos[tagSheetIndex].cropTypeIds}
          onDone={(ids) => {
            updateCropTags(tagSheetIndex, ids)
            setTagSheetIndex(null)
          }}
          onClose={() => setTagSheetIndex(null)}
        />
      )}
    </>
  )
}
