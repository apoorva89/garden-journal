'use client'

import { Fragment, useState, useEffect, useRef } from 'react'
import { getSettings, saveSettings, resetDatabase } from '@/lib/db'
import type { Settings } from '@/lib/db'
import { BASE_PATH } from '../../../base-path.mjs'
import { PROVIDERS, getModelsForProvider } from '@/lib/ai/providerConfig'
import { searchLocations, reverseGeocode } from '@/lib/orchestrator/geocode'
import type { GeoResult } from '@/lib/orchestrator/geocode'

const EMPTY: Settings = {
  locationName: '',
  lastFrostDate: null,
  latitude: null,
  longitude: null,
  aiProvider: '',
  aiModel: '',
  apiKeys: {},
}

function formatResult(r: GeoResult): string {
  return [r.name, r.admin1, r.country].filter(Boolean).join(', ')
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(EMPTY)
  const [loaded, setLoaded] = useState(false)

  // Location typeahead state
  const [suggestions, setSuggestions] = useState<GeoResult[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  // true when the user has typed since the last resolved location
  const [locationDirty, setLocationDirty] = useState(false)

  // Geolocation button state
  const [geoError, setGeoError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Holds latest settings for blur handlers that close over stale state
  const settingsRef = useRef<Settings>(EMPTY)

  useEffect(() => {
    getSettings().then((s) => {
      const resolved = s ?? EMPTY
      setSettings(resolved)
      settingsRef.current = resolved
      setLoaded(true)
    })
  }, [])

  function updateSettings(next: Settings) {
    setSettings(next)
    settingsRef.current = next
  }

  async function persist(next: Settings) {
    updateSettings(next)
    await saveSettings(next)
  }

  // ── Location typeahead ─────────────────────────────────────────────────────

  function handleLocationChange(value: string) {
    // Clear coords when the user edits the field — they must re-select
    const next = { ...settingsRef.current, locationName: value, latitude: null, longitude: null }
    updateSettings(next)
    setLocationDirty(true)
    setSuggestions([])
    setShowDropdown(false)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) return

    debounceRef.current = setTimeout(async () => {
      const results = await searchLocations(value)
      setSuggestions(results)
      setShowDropdown(results.length > 0)
    }, 300)
  }

  function handleLocationBlur() {
    // Save the typed name only (no coords). Don't geocode silently.
    if (locationDirty) {
      saveSettings(settingsRef.current)
    }
    // Give click time to fire on a suggestion before the dropdown closes.
    // We also use onMouseDown + preventDefault on items, so blur shouldn't
    // fire when clicking a suggestion — this is the fallback for clicking elsewhere.
    setTimeout(() => setShowDropdown(false), 100)
  }

  function selectSuggestion(result: GeoResult) {
    const next: Settings = {
      ...settingsRef.current,
      locationName: formatResult(result),
      latitude: result.latitude,
      longitude: result.longitude,
    }
    setLocationDirty(false)
    setSuggestions([])
    setShowDropdown(false)
    persist(next)
  }

  // ── Use current location ───────────────────────────────────────────────────

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser')
      return
    }
    setLocating(true)
    setGeoError(null)

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude, longitude } = coords
        const locationName = await reverseGeocode(latitude, longitude)

        const next: Settings = { ...settingsRef.current, locationName, latitude, longitude }
        setLocationDirty(false)
        setLocating(false)
        persist(next)
      },
      (err) => {
        setLocating(false)
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? 'Location access denied. To re-enable: Settings → Privacy & Security → Location Services → Safari Websites → set to "Ask". You can also search for your location using the text box below.'
            : 'Could not get your location — try searching below',
        )
      },
      { timeout: 10000 },
    )
  }

  // ── Wipe ──────────────────────────────────────────────────────────────────

  function handleWipe() {
    if (!confirm('Wipe all local data? This cannot be undone.')) return
    resetDatabase().then(() => {
      window.location.href = `${BASE_PATH}/journal/`
    })
  }

  if (!loaded) return null

  const hasTextButNoCoords =
    locationDirty && settingsRef.current.locationName.trim() !== '' && settings.latitude == null

  const suggestedModels = getModelsForProvider(settings.aiProvider)

  return (
    <div className="min-h-screen bg-cream pb-24">
      <header className="px-4 pt-12 pb-4">
        <h1 className="text-2xl font-semibold text-ink">Settings</h1>
      </header>

      <div className="px-4 space-y-6">
        {/* Destructive action */}
        <section className="bg-surface rounded-2xl p-4 border border-bone">
          <p className="text-sm text-muted mb-3">
            Permanently deletes all journal entries, crops, and photos from this device.
          </p>
          <button
            onClick={handleWipe}
            className="w-full py-3 rounded-xl bg-red-600 text-white font-medium text-sm active:opacity-80 transition-opacity"
          >
            Wipe local database
          </button>
        </section>

        <hr className="border-bone" />

        {/* Location — no overflow-hidden so the typeahead dropdown isn't clipped */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Location</h2>
          <div className="bg-surface rounded-2xl border border-bone">
            {/* Use current location */}
            <div className="px-4 py-3 border-b border-bone">
              <button
                onClick={handleUseMyLocation}
                disabled={locating}
                className="w-full py-2.5 rounded-xl border border-leaf text-leaf text-sm font-medium active:opacity-70 transition-opacity disabled:opacity-50"
              >
                {locating ? 'Locating…' : 'Use current location'}
              </button>
              {geoError && <p className="mt-2 text-xs text-muted">{geoError}</p>}
            </div>

            {/* Typeahead search — relative so the dropdown is anchored here */}
            <div className="relative border-b border-bone">
              <div className="px-4 py-3">
                <label className="block text-xs text-muted mb-1">Location name</label>
                <input
                  type="text"
                  value={settings.locationName}
                  onChange={(e) => handleLocationChange(e.target.value)}
                  onBlur={handleLocationBlur}
                  placeholder="e.g. Seattle, WA"
                  className="w-full bg-transparent text-ink text-base outline-none placeholder:text-mushroom"
                />
                {hasTextButNoCoords && (
                  <p className="mt-1 text-xs text-muted">
                    Select a location from the list above to save it
                  </p>
                )}
                {settings.latitude != null && settings.longitude != null && (
                  <p className="mt-1 text-xs text-muted">
                    {settings.latitude.toFixed(4)}, {settings.longitude.toFixed(4)}
                  </p>
                )}
              </div>
              {showDropdown && suggestions.length > 0 && (
                <ul className="absolute left-0 right-0 top-full z-30 bg-surface border border-bone rounded-xl shadow-lg overflow-hidden mx-0">
                  {suggestions.map((r, i) => (
                    <li key={i} className="border-b border-bone last:border-0">
                      <button
                        className="w-full text-left px-4 py-3 text-sm text-ink active:bg-bone"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectSuggestion(r)}
                      >
                        {formatResult(r)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Last frost date */}
            <div className="px-4 py-3">
              <label className="block text-xs text-muted mb-1">Last frost date</label>
              <input
                type="date"
                value={settings.lastFrostDate ?? ''}
                onChange={(e) =>
                  updateSettings({ ...settingsRef.current, lastFrostDate: e.target.value || null })
                }
                onBlur={() => persist(settingsRef.current)}
                className="w-full bg-transparent text-ink text-base outline-none"
              />
            </div>
          </div>
        </section>

        {/* AI */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">AI</h2>
          <div className="bg-surface rounded-2xl border border-bone overflow-hidden">
            <div className="px-4 py-3">
              <label className="block text-xs text-muted mb-2">Provider</label>
              <div className="flex gap-2 mb-2">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => persist({ ...settings, aiProvider: p.id })}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      settings.aiProvider === p.id ? 'bg-forest text-cream' : 'bg-bone text-muted'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={settings.aiProvider}
                onChange={(e) => updateSettings({ ...settingsRef.current, aiProvider: e.target.value })}
                onBlur={() => persist(settingsRef.current)}
                placeholder="or type a provider"
                className="w-full bg-transparent text-ink text-base outline-none placeholder:text-mushroom"
              />
            </div>
            <hr className="border-bone" />
            <div className="px-4 py-3">
              <label className="block text-xs text-muted mb-1">Model</label>
              {suggestedModels.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {suggestedModels.map((m) => (
                    <button
                      key={m}
                      onClick={() => persist({ ...settingsRef.current, aiModel: m })}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        settings.aiModel === m ? 'bg-forest text-cream' : 'bg-bone text-muted'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
              <input
                type="text"
                value={settings.aiModel}
                onChange={(e) => updateSettings({ ...settingsRef.current, aiModel: e.target.value })}
                onBlur={() => persist(settingsRef.current)}
                placeholder="or type a model name"
                className="w-full bg-transparent text-ink text-base outline-none placeholder:text-mushroom"
              />
            </div>
            {PROVIDERS.map((p) => (
              <Fragment key={p.id}>
                <hr className="border-bone" />
                <div className="px-4 py-3">
                  <label className="block text-xs text-muted mb-1">API Key ({p.label})</label>
                  <input
                    type="password"
                    value={settings.apiKeys[p.id] ?? ''}
                    onChange={(e) =>
                      updateSettings({
                        ...settingsRef.current,
                        apiKeys: { ...settingsRef.current.apiKeys, [p.id]: e.target.value },
                      })
                    }
                    onBlur={() => persist(settingsRef.current)}
                    placeholder={p.keyPlaceholder}
                    className="w-full bg-transparent text-ink text-base outline-none placeholder:text-mushroom font-mono"
                  />
                </div>
              </Fragment>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
