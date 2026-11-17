// Reading what a guest types in the booking chat: a date, a number of nights, how many guests.
// Pure functions, no I/O. Pakistan time is used for "today".

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

/** Today's date in Pakistan, yyyy-MM-dd. */
export function todayKarachi(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(now);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86400000);
}

const valid = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * A check-in date from free text: "today", "tomorrow", "kal", "5 dec", "5th December", "dec 5", "05/12", "5-12-2026",
 * "2026-12-05". A day and month without a year means the next time that date comes round. Returns yyyy-MM-dd, or null when
 * it isn't a date, is in the past, or is more than a year away.
 */
export function parseDate(text: string, now: Date = new Date()): string | null {
  const today = todayKarachi(now);
  const t = text.toLowerCase().replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  let found: string | null = null;

  if (/\b(today|aaj|tonight)\b/.test(t)) found = today;
  else if (/\b(day after tomorrow|parso|parson)\b/.test(t)) found = addDays(today, 2);
  else if (/\b(tomorrow|tmrw|tmr|kal)\b/.test(t)) found = addDays(today, 1);

  const [ty, tm, td] = today.split("-").map(Number);
  const withYear = (m: number, d: number, y?: number) => {
    if (y !== undefined) return valid(y, m, d) ? iso(y, m, d) : null;
    let year = ty;
    if (!valid(year, m, d)) return null;
    if (iso(year, m, d) < today) year += 1;
    return valid(year, m, d) ? iso(year, m, d) : null;
  };

  if (!found) {
    let m = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
    if (m) found = valid(+m[1], +m[2], +m[3]) ? iso(+m[1], +m[2], +m[3]) : null;
    if (!found) {
      m = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
      if (m) {
        const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : undefined;
        found = withYear(+m[2], +m[1], y); // day / month (Pakistan order)
      }
    }
    if (!found) {
      m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?(?: of)? ([a-z]{3,9})(?: (\d{4}))?\b/);
      if (m && MONTHS[m[2]]) found = withYear(MONTHS[m[2]], +m[1], m[3] ? +m[3] : undefined);
    }
    if (!found) {
      m = t.match(/\b([a-z]{3,9}) (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?\b/);
      if (m && MONTHS[m[1]]) found = withYear(MONTHS[m[1]], +m[2], m[3] ? +m[3] : undefined);
    }
  }
  if (!found || found < today || found > addDays(today, 365)) return null;
  void td;
  return found;
}

/** Number of nights from "3", "3 nights", "teen raat" is not understood, digits only. 1 to 30. */
export function parseNights(text: string): number | null {
  const m = text.match(/\b(\d{1,2})\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 30 ? n : null;
}

export type Guests = { adults: number; children: number };

/** Button/list ids look like "g_2_1" (2 adults, 1 child); free text like "2 adults 1 child" or just "3". */
export function parseGuests(input: { id?: string; text?: string }): Guests | null {
  const id = input.id?.match(/^g_(\d{1,2})_(\d{1,2})$/);
  if (id) return limit({ adults: +id[1], children: +id[2] });
  const t = (input.text ?? "").toLowerCase();
  const adults = t.match(/(\d{1,2})\s*(?:adults?|persons?|people|guests?|bande|log|admi|aadmi|members?)/);
  const kids = t.match(/(\d{1,2})\s*(?:child(?:ren)?|kids?|bache|bachay|baccha|bachon)/);
  if (adults || kids) return limit({ adults: adults ? +adults[1] : 1, children: kids ? +kids[1] : 0 });
  const only = t.trim().match(/^(\d{1,2})$/);
  if (only) return limit({ adults: +only[1], children: 0 });
  return null;
}
function limit(g: Guests): Guests | null {
  return g.adults >= 1 && g.adults <= 8 && g.children >= 0 && g.children <= 6 ? g : null;
}

/** A person's name: letters, spaces and a few marks, 2 to 60 characters, at least one letter. */
export function parseName(text: string): string | null {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length < 2 || t.length > 60) return null;
  if (!/\p{L}/u.test(t)) return null;
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(t)) return null;
  return t;
}

/** A booking ref typed or pasted by the guest, e.g. from the website's WhatsApp message: "Booking Ref: HE-AB12CD". */
export function findBookingRef(text: string | null | undefined): string | null {
  const m = (text ?? "").match(/\b(HE-[A-Z0-9]{4,12})\b/i);
  return m ? m[1].toUpperCase() : null;
}

/** Rounds up to the next 100 so the advance is a tidy number. */
export function roundUp100(n: number): number {
  return Math.ceil(n / 100) * 100;
}
