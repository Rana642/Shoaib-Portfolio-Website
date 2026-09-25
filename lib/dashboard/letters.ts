import type { Letter } from "./types";

/** Today's date in Pakistan as YYYY-MM-DD — the default date for a new
 *  letter. (The server runs in UTC, which is still "yesterday" for the
 *  first five hours of every Karachi day.) */
export function todayInKarachi(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
}

/** The list label: the letter's title, else the start of its text. Plain
 *  text for display only — React escapes it on render. */
export function letterLabel(letter: Pick<Letter, "title" | "body">): string {
  if (letter.title.trim()) return letter.title.trim();
  const text = letter.body
    .replace(/<(br|\/div|\/p|\/li)[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "Untitled letter";
  return text.length > 70 ? `${text.slice(0, 70).trimEnd()}…` : text;
}
