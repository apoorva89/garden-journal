function wmoToIcon(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 2) return '🌤️'
  if (code === 3) return '☁️'
  if (code <= 48) return '🌫️'
  if (code <= 55) return '🌦️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '🌨️'
  if (code <= 82) return '🌦️'
  if (code <= 86) return '🌨️'
  return '⛈️'
}

export interface WeatherResult {
  weatherC: number
  weatherIcon: string
}

export async function fetchWeatherForDate(
  date: string,
  latitude: number,
  longitude: number,
): Promise<WeatherResult | null> {
  try {
    const res = await fetch(
      `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${date}&end_date=${date}&daily=temperature_2m_mean,weathercode&timezone=auto`,
    )
    if (!res.ok) return null
    const json = await res.json()
    const temp = json.daily?.temperature_2m_mean?.[0]
    const code = json.daily?.weathercode?.[0]
    if (temp == null || code == null) return null
    return { weatherC: Math.round(temp), weatherIcon: wmoToIcon(code) }
  } catch {
    return null
  }
}
