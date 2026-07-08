'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getCropTypeById } from '@/lib/db'
import type { CropType } from '@/lib/db'

export default function CropDetail() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = searchParams.get('id')

  const [cropType, setCropType] = useState<CropType | null>(null)

  useEffect(() => {
    if (!id) { router.replace('/crops'); return }
    getCropTypeById(id).then((ct) => {
      if (!ct) { router.replace('/crops'); return }
      setCropType(ct)
    })
  }, [id, router])

  if (!cropType) {
    return (
      <div className="flex items-center justify-center min-h-screen text-mushroom text-sm">
        Loading…
      </div>
    )
  }

  return (
    <div className="px-4 pt-5">
      <button
        onClick={() => router.back()}
        className="text-sm text-mushroom mb-4 block"
      >
        ← Back
      </button>
      <h1 className="text-2xl font-bold text-ink">{cropType.name}</h1>
      <p className="mt-2 text-sm text-muted">More details coming soon.</p>
    </div>
  )
}
