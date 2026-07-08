'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import CropTypeCard from '@/components/crops/CropTypeCard'
import { getAllCropTypes, getLatestPhotoByCropType } from '@/lib/db'
import type { CropType, EntryPhoto } from '@/lib/db'

export default function CropsPage() {
  const [cropTypes, setCropTypes] = useState<CropType[]>([])
  const [photosByCropType, setPhotosByCropType] = useState<Record<string, EntryPhoto | null>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const types = await getAllCropTypes()
      if (cancelled) return
      setCropTypes(types)

      const map: Record<string, EntryPhoto | null> = {}
      await Promise.all(
        types.map(async (t) => {
          map[t.id] = await getLatestPhotoByCropType(t.id)
        }),
      )
      if (cancelled) return
      setPhotosByCropType(map)
      setLoaded(true)
    }

    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="relative min-h-screen">
      {loaded && cropTypes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-muted px-8 text-center">
          <span className="text-5xl mb-4" aria-hidden>🌱</span>
          <p className="text-sm font-medium text-ink">No crops yet</p>
          <p className="text-xs mt-1">Add your first with the + button</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-4">
          {cropTypes.map((ct) => (
            <CropTypeCard
              key={ct.id}
              cropType={ct}
              photo={photosByCropType[ct.id] ?? null}
            />
          ))}
        </div>
      )}

      <Link
        href="/crops/new"
        className="fixed bottom-20 right-4 w-14 h-14 bg-terra rounded-full flex items-center justify-center text-surface text-3xl shadow-lg active:scale-95 transition-transform z-10"
        aria-label="New crop"
      >
        +
      </Link>
    </div>
  )
}
