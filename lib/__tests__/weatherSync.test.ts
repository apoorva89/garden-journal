import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchWeatherForDate } from '../weatherSync'

function mockFetch(data: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(data) }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── fetchWeatherForDate ───────────────────────────────────────────────────────

describe('fetchWeatherForDate', () => {
  it('returns weatherC and weatherIcon for a successful response', async () => {
    mockFetch({ daily: { temperature_2m_mean: [18.4], weathercode: [0] } })
    expect(await fetchWeatherForDate('2026-06-15', 47.6, -122.3)).toEqual({
      weatherC: 18,
      weatherIcon: '☀️',
    })
  })

  it('rounds temperature to the nearest integer', async () => {
    mockFetch({ daily: { temperature_2m_mean: [18.6], weathercode: [1] } })
    expect((await fetchWeatherForDate('2026-06-15', 47.6, -122.3))?.weatherC).toBe(19)
  })

  it('encodes lat, lon, and date in the request URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ daily: { temperature_2m_mean: [15], weathercode: [0] } }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await fetchWeatherForDate('2026-06-15', 51.5, -0.1)
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('latitude=51.5')
    expect(url).toContain('longitude=-0.1')
    expect(url).toContain('start_date=2026-06-15')
    expect(url).toContain('end_date=2026-06-15')
  })

  it('returns null when the response is not ok', async () => {
    mockFetch({}, false)
    expect(await fetchWeatherForDate('2026-06-15', 47.6, -122.3)).toBeNull()
  })

  it('returns null when fetch throws a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    expect(await fetchWeatherForDate('2026-06-15', 47.6, -122.3)).toBeNull()
  })

  it('returns null when temperature is absent', async () => {
    mockFetch({ daily: { temperature_2m_mean: [null], weathercode: [0] } })
    expect(await fetchWeatherForDate('2026-06-15', 47.6, -122.3)).toBeNull()
  })

  it('returns null when weathercode is absent', async () => {
    mockFetch({ daily: { temperature_2m_mean: [18], weathercode: [null] } })
    expect(await fetchWeatherForDate('2026-06-15', 47.6, -122.3)).toBeNull()
  })

  it('returns null when daily object is missing entirely', async () => {
    mockFetch({})
    expect(await fetchWeatherForDate('2026-06-15', 47.6, -122.3)).toBeNull()
  })
})

// ── WMO code → emoji ──────────────────────────────────────────────────────────

describe('WMO code to weather icon', () => {
  async function iconFor(code: number) {
    mockFetch({ daily: { temperature_2m_mean: [0], weathercode: [code] } })
    return (await fetchWeatherForDate('2026-01-01', 0, 0))?.weatherIcon
  }

  it('0  → ☀️  (clear sky)', async () => expect(await iconFor(0)).toBe('☀️'))
  it('1  → 🌤️  (mainly clear)', async () => expect(await iconFor(1)).toBe('🌤️'))
  it('2  → 🌤️  (partly cloudy)', async () => expect(await iconFor(2)).toBe('🌤️'))
  it('3  → ☁️  (overcast)', async () => expect(await iconFor(3)).toBe('☁️'))
  it('45 → 🌫️  (fog)', async () => expect(await iconFor(45)).toBe('🌫️'))
  it('48 → 🌫️  (depositing rime fog)', async () => expect(await iconFor(48)).toBe('🌫️'))
  it('51 → 🌦️  (light drizzle)', async () => expect(await iconFor(51)).toBe('🌦️'))
  it('55 → 🌦️  (dense drizzle)', async () => expect(await iconFor(55)).toBe('🌦️'))
  it('61 → 🌧️  (slight rain)', async () => expect(await iconFor(61)).toBe('🌧️'))
  it('67 → 🌧️  (heavy freezing rain)', async () => expect(await iconFor(67)).toBe('🌧️'))
  it('71 → 🌨️  (slight snow)', async () => expect(await iconFor(71)).toBe('🌨️'))
  it('77 → 🌨️  (snow grains)', async () => expect(await iconFor(77)).toBe('🌨️'))
  it('80 → 🌦️  (slight rain showers)', async () => expect(await iconFor(80)).toBe('🌦️'))
  it('82 → 🌦️  (violent rain showers)', async () => expect(await iconFor(82)).toBe('🌦️'))
  it('85 → 🌨️  (slight snow showers)', async () => expect(await iconFor(85)).toBe('🌨️'))
  it('86 → 🌨️  (heavy snow showers)', async () => expect(await iconFor(86)).toBe('🌨️'))
  it('95 → ⛈️  (thunderstorm)', async () => expect(await iconFor(95)).toBe('⛈️'))
  it('99 → ⛈️  (thunderstorm with heavy hail)', async () => expect(await iconFor(99)).toBe('⛈️'))
})
