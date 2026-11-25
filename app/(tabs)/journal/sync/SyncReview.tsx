'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  getJournalEntryById,
  getPendingExtractionByEntryId,
  getAllCropTypes,
  getCropEventById,
} from '@/lib/db'
import type { JournalEntry, PendingExtraction, CropType, CropEvent } from '@/lib/db'

function formatEventType(eventType: string): string {
  return eventType.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

interface ReviewData {
  entry: JournalEntry
  extraction: PendingExtraction
  cropTypes: CropType[]
  problemsById: Map<string, CropEvent>
}

export default function SyncReview() {
  const searchParams = useSearchParams()
  const id = searchParams.get('id')

  const [data, setData] = useState<ReviewData | null>(null)
  const [empty, setEmpty] = useState(false)

  useEffect(() => {
    async function load() {
      if (!id) { setEmpty(true); return }
      const [entry, extraction] = await Promise.all([
        getJournalEntryById(id),
        getPendingExtractionByEntryId(id),
      ])
      if (!entry || !extraction) {
        setEmpty(true)
        return
      }
      const cropTypes = await getAllCropTypes()
      const problemIds = Array.from(
        new Set(extraction.events.map((r) => r.resolvedLinkedProblemId).filter(Boolean) as string[])
      )
      const problemEntries = await Promise.all(problemIds.map((pid) => getCropEventById(pid)))
      const problemsById = new Map<string, CropEvent>()
      for (let i = 0; i < problemIds.length; i++) {
        const p = problemEntries[i]
        if (p) problemsById.set(problemIds[i], p)
      }
      setData({ entry, extraction, cropTypes, problemsById })
    }
    load()
  }, [id])

  if (empty) {
    return (
      <div className="flex flex-col items-center gap-4 p-8 text-ink">
        <p>No extraction to review</p>
        <Link href="/journal">Back to Journal</Link>
      </div>
    )
  }

  if (!data) return null

  const { entry, extraction, cropTypes, problemsById } = data
  const cropNameById = new Map(cropTypes.map((c) => [c.id, c.name]))

  return (
    <div className="p-4 flex flex-col gap-4 text-ink">
      <p className="whitespace-pre-wrap">{entry.text}</p>
      {extraction.events.map((review) => {
        const cropName = review.resolvedCropTypeId
          ? (cropNameById.get(review.resolvedCropTypeId) ?? 'General')
          : 'General'
        const problem = review.resolvedLinkedProblemId
          ? problemsById.get(review.resolvedLinkedProblemId)
          : undefined
        return (
          <article key={review.id} className="border border-bone rounded bg-surface p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span>{cropName}</span>
              <span className="rounded px-1 text-xs bg-weather text-forest">{formatEventType(review.extracted.eventType)}</span>
            </div>
            <p>{review.extracted.notes}</p>
            {problem && <p className="text-sm text-muted">{problem.notes}</p>}
          </article>
        )
      })}
    </div>
  )
}
