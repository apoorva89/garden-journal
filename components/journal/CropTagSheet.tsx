'use client'

import { useState, useEffect, useRef } from 'react'
import { getAllCropTypes, createCropType } from '@/lib/db'
import type { CropType } from '@/lib/db'

interface Props {
  photoLabel: string
  selectedIds: string[]
  onDone: (ids: string[]) => void
  onClose: () => void
}

export default function CropTagSheet({ photoLabel, selectedIds, onDone, onClose }: Props) {
  const [crops, setCrops] = useState<CropType[]>([])
  const [search, setSearch] = useState('')
  const [checked, setChecked] = useState<Set<string>>(() => new Set(selectedIds))
  const [creatingName, setCreatingName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const createInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getAllCropTypes().then(setCrops)
  }, [])

  useEffect(() => {
    if (showCreate) createInputRef.current?.focus()
  }, [showCreate])

  const filtered = crops.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  )

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCreateCrop() {
    const name = creatingName.trim()
    if (!name) return
    const crop = await createCropType({ name, lessons: [] })
    setCrops((prev) => [...prev, crop])
    setChecked((prev) => new Set([...prev, crop.id]))
    setCreatingName('')
    setShowCreate(false)
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-2xl z-50 flex flex-col"
        style={{ maxHeight: '80vh' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-none">
          <div className="w-10 h-1 rounded-full bg-bone" />
        </div>

        {/* Header */}
        <div className="px-4 pb-3 border-b border-bone flex-none">
          <h2 className="text-sm font-bold text-ink">Tag crops in photo</h2>
          <p className="text-xs text-muted mt-0.5">{photoLabel}</p>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-bone flex-none">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search crops…"
            className="w-full bg-cream rounded-xl px-3 py-2 text-base text-ink placeholder:text-mushroom outline-none"
          />
        </div>

        {/* Scrollable list */}
        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 && search.length > 0 && (
            <p className="px-4 py-6 text-sm text-muted text-center">No crops match "{search}"</p>
          )}
          {filtered.length === 0 && search.length === 0 && crops.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted text-center">No crops yet — add one below.</p>
          )}

          {filtered.map((crop) => (
            <button
              key={crop.id}
              onClick={() => toggle(crop.id)}
              className="flex items-center justify-between w-full px-4 py-3 border-b border-bone last:border-0 active:bg-cream"
            >
              <span className="text-sm text-ink text-left">{crop.name}</span>
              <span
                className={[
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] flex-none ml-3 transition-colors',
                  checked.has(crop.id)
                    ? 'bg-leaf border-leaf text-surface'
                    : 'border-mushroom',
                ].join(' ')}
              >
                {checked.has(crop.id) ? '✓' : ''}
              </span>
            </button>
          ))}

          {/* Create new crop row */}
          {showCreate ? (
            <div className="flex items-center gap-2 px-4 py-3 border-b border-bone">
              <input
                ref={createInputRef}
                type="text"
                value={creatingName}
                onChange={(e) => setCreatingName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateCrop()}
                placeholder="Crop name…"
                className="flex-1 bg-cream rounded-xl px-3 py-2 text-base text-ink placeholder:text-mushroom outline-none"
              />
              <button
                onClick={handleCreateCrop}
                disabled={!creatingName.trim()}
                className="text-sm font-semibold text-leaf disabled:opacity-40"
              >
                Add
              </button>
              <button
                onClick={() => { setShowCreate(false); setCreatingName('') }}
                className="text-sm text-mushroom"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 w-full px-4 py-3 text-leaf text-sm font-medium active:bg-cream"
            >
              <span className="text-lg leading-none">+</span>
              Create new crop
            </button>
          )}
        </div>

        {/* Done button */}
        <div
          className="px-4 pt-3 border-t border-bone flex-none"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => onDone(Array.from(checked))}
            className="w-full h-11 rounded-full bg-leaf text-surface font-semibold text-sm active:opacity-80"
          >
            Done — {checked.size} crop{checked.size !== 1 ? 's' : ''} tagged
          </button>
        </div>
      </div>
    </>
  )
}
