import "server-only";
import { db } from "./dashboard/db";
import { pakistanHolidays } from "./holidays";
import { cityForecast } from "./weather";

/** What the Planner shows under each date: Pakistan's holiday and the project's city weather. */
export type DayNote = {
  holiday?: { name: string; moon: boolean };
  weather?: { max: number; min: number; rain: number; label: string; emoji: string };
};

export async function plannerDayNotes(projectId: string): Promise<{ notes: Record<string, DayNote>; city: string | null }> {
  const { data } = await db.from("client_projects").select("city").eq("id", projectId).maybeSingle();
  const city = (data?.city as string | null) ?? null;
  const [holidays, forecast] = await Promise.all([pakistanHolidays(), city ? cityForecast(city) : Promise.resolve(null)]);

  const notes: Record<string, DayNote> = {};
  for (const h of holidays) {
    notes[h.date] = { ...notes[h.date], holiday: { name: h.name, moon: h.moon } };
  }
  for (const d of forecast?.days ?? []) {
    notes[d.date] = { ...notes[d.date], weather: { max: d.max, min: d.min, rain: d.rain, label: d.label, emoji: d.emoji } };
  }
  return { notes, city: forecast?.place ?? city };
}
