'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import BlobImage from '@/components/BlobImage'
import {
  getCropTypeById,
  getCropInstancesByType,
  getLatestPhotoByCropTypeAndYear,
  addLessonToCropType,
} from '@/lib/db'
import type { CropType, CropInstance, EntryPhoto } from '@/lib/db'

const PALETTE = [
  '#4A7C4A',
  '#C4623A',
  '#2D4A2D',
  '#8C8279',
  '#6B8F6B',
  '#A0522D',
  '#5F7A5F',
  '#B07050',
]

function colorForKey(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

interface InstanceCard {
  instance: CropInstance
  photo: EntryPhoto | null
}

export default function CropDetail() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = searchParams.get('id')

  const [cropType, setCropType] = useState<CropType | null>(null)
  const [instances, setInstances] = useState<InstanceCard[]>([])
  const [instancesLoaded, setInstancesLoaded] = useState(false)
  const [addingLesson, setAddingLesson] = useState(false)
  const [lessonText, setLessonText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!id) { router.replace('/crops'); return }
    getCropTypeById(id).then((ct) => {
      if (!ct) { router.replace('/crops'); return }
      setCropType(ct)
    })
  }, [id, router])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    getCropInstancesByType(id)
      .then(async (list) => {
        const sorted = [...list].sort((a, b) => b.year - a.year)
        const cards: InstanceCard[] = await Promise.all(
          sorted.map(async (instance) => ({
            instance,
            photo: await getLatestPhotoByCropTypeAndYear(id, instance.year),
          })),
        )
        if (!cancelled) { setInstances(cards); setInstancesLoaded(true) }
      })
      .catch((err) => {
        console.error('Failed to load instances:', err)
        if (!cancelled) setInstancesLoaded(true)
      })
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    if (addingLesson) inputRef.current?.focus()
  }, [addingLesson])

  async function handleAddLesson() {
    const text = lessonText.trim()
    if (!text || !id) return
    setSubmitting(true)
    await addLessonToCropType(id, text)
    const updated = await getCropTypeById(id)
    if (updated) setCropType(updated)
    setLessonText('')
    setAddingLesson(false)
    setSubmitting(false)
  }

  if (!cropType) {
    return (
      <div className="flex items-center justify-center min-h-screen text-mushroom text-sm">
        Loading…
      </div>
    )
  }

  return (
    <div className="px-4 pt-5 pb-10">
      <button
        onClick={() => router.push('/crops')}
        className="text-sm text-mushroom mb-4 block"
      >
        ← Back
      </button>

      <h1 className="text-2xl font-bold text-forest mb-6">{cropType.name}</h1>

      {/* Lessons Learned */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-ink mb-3">Lessons Learned</h2>

        {cropType.lessons.length === 0 && !addingLesson && (
          <p className="text-sm text-muted mb-3">No lessons yet</p>
        )}

        {cropType.lessons.length > 0 && (
          <ul className="space-y-2 mb-3">
            {cropType.lessons.map((lesson) => (
              <li key={lesson.id} className="text-sm text-ink leading-relaxed">
                {lesson.text}
              </li>
            ))}
          </ul>
        )}

        {addingLesson ? (
          <div className="mt-2">
            <textarea
              ref={inputRef}
              value={lessonText}
              onChange={(e) => setLessonText(e.target.value)}
              rows={3}
              placeholder="What did you learn?"
              className="w-full rounded-xl border border-bone bg-cream px-3 py-2 text-sm text-ink placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-forest/30"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleAddLesson}
                disabled={submitting || !lessonText.trim()}
                className="flex-1 rounded-xl bg-forest text-white text-sm font-medium py-2 active:opacity-80 disabled:opacity-40"
              >
                Save
              </button>
              <button
                onClick={() => { setAddingLesson(false); setLessonText('') }}
                className="flex-1 rounded-xl bg-bone text-ink text-sm font-medium py-2 active:opacity-80"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingLesson(true)}
            className="text-sm text-forest font-medium active:opacity-70"
          >
            + Add lesson
          </button>
        )}
      </section>

      {/* Yearly Instances */}
      <section>
        <h2 className="text-base font-semibold text-ink mb-3">Yearly Instances</h2>

        {!instancesLoaded ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : instances.length === 0 ? (
          <p className="text-sm text-muted">No instances yet</p>
        ) : (
          <div className="space-y-3">
            {instances.map(({ instance, photo }) => {
              const bg = colorForKey(cropType.name + String(instance.year))
              const source = instance.source.type === 'nursery' ? instance.source.name : 'From seed'
              return (
                <Link
                  key={instance.id}
                  href={`/crline?cropTypeId=${id}&instanceId=${instance.id}`}
                  className="relative flex items-end rounded-2xl overflow-hidden active:opacity-80"
                  style={{ height: 120 }}
                >
                  {photo ? (
                    <BlobImage
                      blob={photo.data}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0" style={{ backgroundColor: bg }} />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="relative px-3 py-2.5">
                    <div className="text-white font-semibold text-sm leading-tight">
                      {instance.year} · {instance.variety}
                    </div>
                    <div className="text-white/70 text-xs mt-0.5">{source}</div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
