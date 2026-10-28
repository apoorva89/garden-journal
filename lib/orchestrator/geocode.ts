export interface GeoResult {
  name: string
  admin1?: string
  country?: string
  latitude: number
  longitude: number
}

export async function searchLocations(query: string): Promise<GeoResult[]> {
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10`,
    )
    if (!res.ok) return []
    const json = await res.json()
    return (json.results as GeoResult[]) ?? []
  } catch {
    return []
  }
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  const fallback = `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
      { headers: { 'User-Agent': 'GardenJournal/1.0' } },
    )
    if (!res.ok) return fallback
    const json = await res.json()
    const { city, town, village, state } = json.address ?? {}
    const place = city ?? town ?? village
    if (place) return [place, state].filter(Boolean).join(', ')
    return fallback
  } catch {
    return fallback
  }
}
