import "server-only";

/**
 * Daily forecast for a city from Open-Meteo (free, no key — Shoaib's
 * public-apis fork): up to 16 days ahead, for planning posts and ads around
 * heat, rain or cold. The city name is geocoded with Open-Meteo's own
 * geocoding API. Cached for 3 hours.
 */
export type DayWeather = { date: string; max: number; min: number; code: number; rain: number; label: string; emoji: string };

/** WMO weather code → a short label + emoji. */
export function describeWeather(code: number): { label: string; emoji: string } {
  if (code === 0) return { label: "Clear", emoji: "☀️" };
  if (code <= 2) return { label: "Partly cloudy", emoji: "🌤️" };
  if (code === 3) return { label: "Cloudy", emoji: "☁️" };
  if (code === 45 || code === 48) return { label: "Fog", emoji: "🌫️" };
  if (code >= 51 && code <= 57) return { label: "Drizzle", emoji: "🌦️" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: "Rain", emoji: "🌧️" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: "Snow", emoji: "❄️" };
  if (code >= 95) return { label: "Thunderstorm", emoji: "⛈️" };
  return { label: "—", emoji: "🌡️" };
}

export async function geocodeCity(city: string): Promise<{ name: string; country: string; lat: number; lon: number } | null> {
  const q = new URLSearchParams({ name: city.trim(), count: "1", language: "en", format: "json" });
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${q}`, {
    next: { revalidate: 30 * 86400 },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { results?: { name: string; country: string; latitude: number; longitude: number }[] };
  const r = json.results?.[0];
  return r ? { name: r.name, country: r.country, lat: r.latitude, lon: r.longitude } : null;
}

export async function cityForecast(city: string, days = 16): Promise<{ place: string; days: DayWeather[] } | null> {
  try {
    const geo = await geocodeCity(city);
    if (!geo) return null;
    const q = new URLSearchParams({
      latitude: String(geo.lat),
      longitude: String(geo.lon),
      daily: "temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max",
      timezone: "Asia/Karachi",
      forecast_days: String(Math.min(16, Math.max(1, days))),
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, {
      next: { revalidate: 3 * 3600 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      daily?: {
        time: string[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        weather_code: number[];
        precipitation_probability_max: number[];
      };
    };
    const d = json.daily;
    if (!d) return null;
    return {
      place: `${geo.name}, ${geo.country}`,
      days: d.time.map((date, i) => ({
        date,
        max: Math.round(d.temperature_2m_max[i]),
        min: Math.round(d.temperature_2m_min[i]),
        code: d.weather_code[i],
        rain: d.precipitation_probability_max[i] ?? 0,
        ...describeWeather(d.weather_code[i]),
      })),
    };
  } catch {
    return null;
  }
}
