'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getJournalEntryById, getEntryPhotosByEntry, updateJournalEntryAndPhotoDates, createEntryPhoto, updateEntryPhoto, deleteEntryPhoto } from '@/lib/db'
import { resizeToBlob } from '@/lib/resizeImage'
import BlobImage from '@/components/BlobImage'
import CropTagSheet from '@/components/journal/CropTagSheet'
import type { JournalEntry } from '@/lib/db'

function todayStr(): string {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

interface PhotoItem {
  id?: string
  data: Blob
  cropTypeIds: string[]
  createdAt?: string
}

export default function EntryDetail() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = searchParams.get('id')

  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [loading, setLoading] = useState(true)

  const [date, setDate] = useState('')
  const [text, setText] = useState('')
  const [nextSeasonNote, setNextSeasonNote] = useState('')
  const [nextSeasonOpen, setNextSeasonOpen] = useState(false)
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<string[]>([])
  const [tagSheetIndex, setTagSheetIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) { router.replace('/journal'); return }
    async function load() {
      const e = await getJournalEntryById(id!)
      if (!e) { router.replace('/journal'); return }
      const ps = await getEntryPhotosByEntry(id!)
      setEntry(e)
      setDate(e.date)
      setText(e.text)
      setNextSeasonNote(e.nextSeasonNote)
      setNextSeasonOpen(!!e.nextSeasonNote)
      setPhotos(ps.map((p) => ({ id: p.id, data: p.data, cropTypeIds: p.cropTypeIds, createdAt: p.createdAt })))
      setLoading(false)
    }
    load()
  }, [id, router])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    const newItems = await Promise.all(
      files.map(async (file) => ({ data: await resizeToBlob(file), cropTypeIds: [] as string[] })),
    )
    setPhotos((prev) => [...prev, ...newItems])
    e.target.value = ''
  }, [])

  function removePhoto(index: number) {
    const photo = photos[index]
    if (photo.id) setDeletedPhotoIds((prev) => [...prev, photo.id!])
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  const updateCropTags = useCallback((idx: number, cropTypeIds: string[]) => {
    setPhotos((prev) => prev.map((p, i) => (i === idx ? { ...p, cropTypeIds } : p)))
  }, [])

  async function handleSave() {
    if (saving || !entry) return
    setSaving(true)
    try {
      const now = new Date().toISOString()

      for (const photoId of deletedPhotoIds) {
        await deleteEntryPhoto(photoId)
      }

      const photoIds: string[] = []
      for (const photo of photos) {
        if (photo.id) {
          await updateEntryPhoto({ id: photo.id, entryId: entry.id, data: photo.data, cropTypeIds: photo.cropTypeIds, createdAt: photo.createdAt ?? now, entryDate: date })
          photoIds.push(photo.id)
        } else {
          const ep = await createEntryPhoto({ entryId: entry.id, data: photo.data, cropTypeIds: photo.cropTypeIds, createdAt: now, entryDate: date })
          photoIds.push(ep.id)
        }
      }

      await updateJournalEntryAndPhotoDates({ ...entry, date, yearMonth: date.slice(0, 7), text, nextSeasonNote, photoIds, needsSync: 1 })
      router.back()
    } finally {
      setSaving(false)
    }
  }

  if (loading || !entry) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-cream text-mushroom text-sm">
        Loading…
      </div>
    )
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
            className="w-full bg-surface rounded-2xl p-4 text-base text-ink leading-relaxed resize-none outline-none placeholder:text-mushroom"
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
              <div key={i} className="flex-none flex flex-col items-center gap-1 relative">
                <button onClick={() => setTagSheetIndex(i)} className="active:opacity-70">
                  <BlobImage blob={photo.data} alt="" className="w-20 h-20 object-cover rounded-xl" />
                </button>
                <button
                  onClick={() => removePhoto(i)}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-ink text-surface rounded-full text-[11px] flex items-center justify-center leading-none"
                  aria-label="Remove photo"
                >
                  ×
                </button>
                {photo.cropTypeIds.length > 0 && (
                  <span className="text-[9px] text-leaf font-semibold">{photo.cropTypeIds.length} tagged</span>
                )}
              </div>
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
              className="mt-2 w-full bg-surface rounded-2xl p-4 text-base text-ink leading-relaxed resize-none outline-none placeholder:text-mushroom"
              style={{ minHeight: 120, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
            />
          )}
        </div>
      </div>

      {/* Save bar */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-surface border-t border-bone px-4 flex items-center gap-3 z-30"
        style={{ paddingTop: '0.75rem', paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
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
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {tagSheetIndex !== null && (
        <CropTagSheet
          photoLabel={`Photo ${tagSheetIndex + 1}`}
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
