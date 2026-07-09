'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getAllCropTypes, createCropType, createCropInstance } from '@/lib/db'
import type { CropType } from '@/lib/db'

export default function NewCropForm() {
  const router = useRouter()
  const [allCropTypes, setAllCropTypes] = useState<CropType[]>([])
  const [loadError, setLoadError] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedType, setSelectedType] = useState<CropType | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [variety, setVariety] = useState('')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [source, setSource] = useState<'nursery' | 'seed'>('nursery')
  const [nurseryName, setNurseryName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    getAllCropTypes()
      .then(setAllCropTypes)
      .catch(() => setLoadError(true))
  }, [])

  const trimmed = query.trim()

  const filtered = trimmed
    ? allCropTypes.filter((ct) =>
        ct.name.toLowerCase().includes(trimmed.toLowerCase()),
      )
    : []

  const exactMatch = allCropTypes.find(
    (ct) => ct.name.toLowerCase() === trimmed.toLowerCase(),
  )

  function selectType(ct: CropType) {
    setSelectedType(ct)
    setQuery(ct.name)
    setShowSuggestions(false)
  }

  function handleQueryChange(value: string) {
    setQuery(value)
    setSelectedType(null)
    setShowSuggestions(true)
  }

  const parsedYear = parseInt(year, 10)
  const canSave =
    trimmed.length > 0 &&
    !isNaN(parsedYear) &&
    (source === 'seed' || nurseryName.trim().length > 0)

  async function handleSave() {
    if (!canSave || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      let cropTypeId: string
      const resolved = selectedType ?? exactMatch ?? null
      if (resolved) {
        cropTypeId = resolved.id
      } else {
        const newType = await createCropType({ name: trimmed, lessons: [] })
        cropTypeId = newType.id
      }
      await createCropInstance({
        cropTypeId,
        variety: variety.trim(),
        year: parsedYear,
        source: source === 'nursery' ? { type: 'nursery', name: nurseryName.trim() } : { type: 'seed' },
        createdAt: new Date().toISOString(),
      })
      router.push(`/crops/detail?id=${cropTypeId}`)
    } catch {
      setSaveError('Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  return (
    <>
      <div className="pb-24 min-h-screen bg-surface">
        <div className="px-4 pt-5 pb-3">
          <h1 className="text-base font-semibold text-ink">New Crop</h1>
        </div>

        {loadError && (
          <p className="mx-4 mb-4 text-xs text-red-500">
            Failed to load crop types. Existing crops won&apos;t appear as suggestions.
          </p>
        )}

        <div className="px-4 space-y-6">
          {/* Crop type */}
          <div>
            <label className="block text-xs font-medium text-mushroom mb-1 uppercase tracking-wide">
              Crop Type
            </label>
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setShowSuggestions(false)}
                placeholder="e.g. Tomato"
                className="w-full rounded-xl border border-mushroom/30 bg-cream px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-leaf"
              />
              {showSuggestions && trimmed.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full rounded-xl border border-mushroom/20 bg-surface shadow-lg overflow-hidden">
                  {filtered.map((ct) => (
                    <li key={ct.id}>
                      <button
                        type="button"
                        onMouseDown={() => selectType(ct)}
                        className="w-full px-3 py-2.5 text-left text-sm text-ink hover:bg-cream active:bg-bone"
                      >
                        {ct.name}
                      </button>
                    </li>
                  ))}
                  {!exactMatch && (
                    <li>
                      <button
                        type="button"
                        onMouseDown={() => setShowSuggestions(false)}
                        className="w-full px-3 py-2.5 text-left text-sm text-leaf font-medium hover:bg-cream active:bg-bone"
                      >
                        Create &ldquo;{trimmed}&rdquo; as new crop type
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>

          {/* Variety */}
          <div>
            <label className="block text-xs font-medium text-mushroom mb-1 uppercase tracking-wide">
              Variety <span className="normal-case font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={variety}
              onChange={(e) => setVariety(e.target.value)}
              placeholder="e.g. Sungold"
              className="w-full rounded-xl border border-mushroom/30 bg-cream px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-leaf"
            />
          </div>

          {/* Year */}
          <div>
            <label className="block text-xs font-medium text-mushroom mb-1 uppercase tracking-wide">
              Year
            </label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-full rounded-xl border border-mushroom/30 bg-cream px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-leaf"
            />
          </div>

          {/* Source */}
          <div>
            <label className="block text-xs font-medium text-mushroom mb-2 uppercase tracking-wide">
              Source
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSource('nursery')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  source === 'nursery'
                    ? 'bg-forest text-surface'
                    : 'bg-bone text-mushroom'
                }`}
              >
                Nursery
              </button>
              <button
                type="button"
                onClick={() => setSource('seed')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  source === 'seed'
                    ? 'bg-forest text-surface'
                    : 'bg-bone text-mushroom'
                }`}
              >
                Grown from seed
              </button>
            </div>
            {source === 'nursery' && (
              <input
                type="text"
                value={nurseryName}
                onChange={(e) => setNurseryName(e.target.value)}
                placeholder="Nursery name"
                className="mt-3 w-full rounded-xl border border-mushroom/30 bg-cream px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-leaf"
              />
            )}
          </div>
        </div>
      </div>

      {/* Pinned bottom bar — z-30 covers the TabBar (z-20) */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-surface border-t border-bone px-4 z-30"
        style={{
          paddingTop: '0.75rem',
          paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
        }}
      >
        {saveError && (
          <p className="text-xs text-red-500 text-center mb-2">{saveError}</p>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/crops')}
            className="flex-1 h-11 rounded-full border border-bone text-sm font-medium text-mushroom active:opacity-70"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="flex-1 h-11 rounded-full bg-terra text-surface font-semibold text-sm active:opacity-80 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Crop'}
          </button>
        </div>
      </div>
    </>
  )
}
