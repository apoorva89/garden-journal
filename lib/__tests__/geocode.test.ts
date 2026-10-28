import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchLocations, reverseGeocode } from '../orchestrator/geocode'

afterEach(() => {
  vi.unstubAllGlobals()
})

function mockOk(data: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(data) }))
}

// ── searchLocations ───────────────────────────────────────────────────────────

describe('searchLocations', () => {
  it('returns results from the open-meteo geocoding API', async () => {
    const results = [
      { name: 'Seattle', admin1: 'Washington', country: 'United States', latitude: 47.6, longitude: -122.3 },
    ]
    mockOk({ results })
    expect(await searchLocations('Seattle')).toEqual(results)
  })

  it('calls the correct URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ results: [] }) })
    vi.stubGlobal('fetch', fetchMock)
    await searchLocations('Portland')
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('geocoding-api.open-meteo.com/v1/search')
    expect(url).toContain('name=Portland')
    expect(url).toContain('count=10')
  })

  it('returns [] on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    expect(await searchLocations('Seattle')).toEqual([])
  })

  it('returns [] when response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    expect(await searchLocations('Seattle')).toEqual([])
  })

  it('returns [] when results field is absent', async () => {
    mockOk({})
    expect(await searchLocations('Seattle')).toEqual([])
  })
})

// ── reverseGeocode ────────────────────────────────────────────────────────────

describe('reverseGeocode', () => {
  it('returns city and state from nominatim response', async () => {
    mockOk({ address: { city: 'Seattle', state: 'Washington' } })
    expect(await reverseGeocode(47.6, -122.3)).toBe('Seattle, Washington')
  })

  it('prefers city over town and village', async () => {
    mockOk({ address: { city: 'Seattle', town: 'Eastlake', village: 'V', state: 'Washington' } })
    expect(await reverseGeocode(47.6, -122.3)).toBe('Seattle, Washington')
  })

  it('falls back to town when city is absent', async () => {
    mockOk({ address: { town: 'Issaquah', state: 'Washington' } })
    expect(await reverseGeocode(47.53, -122.03)).toBe('Issaquah, Washington')
  })

  it('falls back to raw coords on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    expect(await reverseGeocode(47.6, -122.3)).toBe('47.60, -122.30')
  })

  it('falls back to raw coords when response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    expect(await reverseGeocode(47.6, -122.3)).toBe('47.60, -122.30')
  })

  it('falls back to raw coords when no place found', async () => {
    mockOk({ address: { state: 'Washington' } })
    expect(await reverseGeocode(47.6, -122.3)).toBe('47.60, -122.30')
  })

  it('omits state when absent', async () => {
    mockOk({ address: { city: 'London' } })
    expect(await reverseGeocode(51.5, -0.1)).toBe('London')
  })
})
