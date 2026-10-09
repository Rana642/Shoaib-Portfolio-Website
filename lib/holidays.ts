import "server-only";

/**
 * Pakistan's public holidays from caldays.com (free, no key, CC BY 4.0 —
 * picked from Shoaib's public-apis fork). It serves the current year only,
 * so the Planner shows holidays up to 31 December; next year's appear once
 * the year turns. Eid / Ashura / Milad dates are moon-sighted: the real day
 * can shift by a day, so they're marked as "expected".
 * Cached for a day.
 */
export type Holiday = { date: string; name: string; moon: boolean };

const MOON = /eid|ashura|milad|muharram|ramadan|shab/i;

export async function pakistanHolidays(): Promise<Holiday[]> {
  try {
    const res = await fetch("https://caldays.com/api/holidays/pk", {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { holidays?: { date: string; name: string }[] };
    return (json.holidays ?? [])
      .filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.date) && h.name)
      .map((h) => ({ date: h.date, name: h.name, moon: MOON.test(h.name) }));
  } catch {
    return [];
  }
}
