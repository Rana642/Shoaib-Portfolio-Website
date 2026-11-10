/**
 * Planner pre-flight checks: pure functions (no database, no server-only), so
 * they can be tested alone. lib/post-preflight.ts feeds them real posts.
 *
 * A check never changes a caption or a post. It returns findings; the person
 * (or Claude) decides. Every finding carries English and Roman Urdu text.
 */

export type Severity = "fix" | "check";

export type Finding = {
  code: string;
  severity: Severity;
  en: string;
  ur: string;
};

/** Words the house style does not use in captions (extend here when a new rule is agreed). */
export const FORBIDDEN_WORDS = ["dealer"];

const EMOJI = /\p{Extended_Pictographic}/u;

/** Lower-case words, punctuation stripped, for comparing captions. */
export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** 0..1 overlap of two captions' word sets. */
export function captionSimilarity(a: string, b: string): number {
  const sa = new Set(normalizeWords(a));
  const sb = new Set(normalizeWords(b));
  if (!sa.size || !sb.size) return 0;
  let both = 0;
  for (const w of sa) if (sb.has(w)) both++;
  return both / (sa.size + sb.size - both);
}

export function checkCaption(caption: string): Finding[] {
  const out: Finding[] = [];

  if (EMOJI.test(caption)) {
    out.push({
      code: "emoji",
      severity: "fix",
      en: "The caption contains an emoji. House rule: no emojis in captions.",
      ur: "Caption mein emoji hai. Rule hai ke caption mein koi emoji nahi hota.",
    });
  }

  const words = normalizeWords(caption);
  for (const bad of FORBIDDEN_WORDS) {
    if (words.includes(bad)) {
      out.push({
        code: "forbidden-word",
        severity: "fix",
        en: `The caption uses the word "${bad}", which we do not use.`,
        ur: `Caption mein "${bad}" lafz hai, jo hum istemal nahi karte.`,
      });
    }
  }

  // Typing slip: the same word twice in a row ("the the").
  const doubled = words.find((w, i) => i > 0 && w === words[i - 1] && /^\p{L}{2,}$/u.test(w));
  if (doubled) {
    out.push({
      code: "repeated-word",
      severity: "check",
      en: `The word "${doubled}" appears twice in a row. Probably a typing slip.`,
      ur: `"${doubled}" lafz do baar lagatar aaya hai. Shayad typing ki ghalti hai.`,
    });
  }

  if (/[!?]{3,}/.test(caption)) {
    out.push({
      code: "punctuation",
      severity: "check",
      en: "Three or more ! or ? in a row. Use one.",
      ur: "Teen ya zyada ! ya ? lagatar hain. Sirf ek rakhein.",
    });
  }

  const letters = caption.replace(/[^\p{L}]/gu, "");
  const upper = caption.replace(/[^\p{Lu}]/gu, "");
  if (letters.length >= 30 && upper.length / letters.length > 0.5) {
    out.push({
      code: "all-caps",
      severity: "check",
      en: "More than half of the caption is in capital letters. It reads as shouting.",
      ur: "Caption ka aadhe se zyada hissa capital letters mein hai. Ye chikhne jaisa lagta hai.",
    });
  }

  if (/ {2,}/.test(caption)) {
    out.push({
      code: "double-space",
      severity: "check",
      en: "The caption has double spaces.",
      ur: "Caption mein double spaces hain.",
    });
  }

  return out;
}

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** The weekday (0 = Sunday) of an ISO time as seen in Pakistan. */
export function pktWeekday(iso: string): number {
  return new Date(new Date(iso).getTime() + PKT_OFFSET_MS).getUTCDay();
}

export function checkSchedule(scheduledAtIso: string | null, now = new Date()): Finding[] {
  const out: Finding[] = [];
  if (!scheduledAtIso) return out;
  const t = new Date(scheduledAtIso).getTime();
  if (Number.isNaN(t)) return out;

  if (t < now.getTime() - 5 * 60 * 1000) {
    out.push({
      code: "in-the-past",
      severity: "fix",
      en: "The scheduled time has already passed, so the post would go out immediately.",
      ur: "Scheduled waqt guzar chuka hai, is liye post foran lag jayegi.",
    });
  }
  if (pktWeekday(scheduledAtIso) === 5) {
    out.push({
      code: "friday",
      severity: "check",
      en: "This post is on a Friday (Pakistan time). Confirm it follows the Friday/Jummah rule: a Jummah post on Friday, nothing promotional that clashes with it.",
      ur: "Ye post Jumma (Pakistan time) ko hai. Check karein ke Friday/Jummah rule follow ho raha hai.",
    });
  }
  return out;
}

export type PastPost = {
  id: string;
  original_filename: string;
  media_key: string;
  caption: string | null;
  scheduled_at: string | null;
  /** The file's MD5 (lib/media-fingerprint.ts); null for posts from before it. */
  media_md5?: string | null;
};

/** The same picture (by content), a same-named file whose content can't be compared, or a near-identical caption among the project's recent posts. */
export function checkDuplicates(self: { id: string; original_filename: string; media_key: string; caption: string; media_md5?: string | null }, others: PastPost[]): Finding[] {
  const out: Finding[] = [];
  const day = (p: PastPost) => (p.scheduled_at ? p.scheduled_at.slice(0, 10) : "no date");

  // By content, never by name alone: monthly folders reuse names (1.png, Friday-1.png…) for new posts.
  const sameFile = others.filter((p) => p.id !== self.id && (p.media_key === self.media_key || (Boolean(self.media_md5) && p.media_md5 === self.media_md5)));
  const sameNameOnly = others.filter(
    (p) => p.id !== self.id && !sameFile.includes(p) && p.original_filename.toLowerCase() === self.original_filename.toLowerCase() && !(self.media_md5 && p.media_md5)
  );
  if (sameNameOnly.length && !sameFile.length) {
    out.push({
      code: "same-name",
      severity: "check",
      en: `Another post of this project has the same file name (${sameNameOnly.slice(0, 3).map((p) => `${p.original_filename}, ${day(p)}`).join("; ")}) and its content can't be compared. Make sure this is a new picture.`,
      ur: `Is project ki ek aur post ka file naam same hai. Dekh lein ke ye nayi tasveer hai.`,
    });
  }
  if (sameFile.length) {
    out.push({
      code: "duplicate-image",
      severity: "fix",
      en: `The same image file is already used by ${sameFile.length} other post${sameFile.length === 1 ? "" : "s"} of this project (${sameFile.slice(0, 3).map((p) => `${p.original_filename}, ${day(p)}`).join("; ")}).`,
      ur: `Yehi image file is project ki ${sameFile.length} aur post mein pehle se lagi hai. Nayi image chahiye.`,
    });
  }

  const similar = others.filter((p) => p.id !== self.id && p.caption && captionSimilarity(p.caption, self.caption) >= 0.8);
  if (similar.length) {
    out.push({
      code: "duplicate-caption",
      severity: "check",
      en: `The caption is almost the same as ${similar.length} other post${similar.length === 1 ? "" : "s"} of this project (${similar.slice(0, 3).map((p) => `${p.original_filename}, ${day(p)}`).join("; ")}).`,
      ur: `Caption is project ki ${similar.length} aur post se lagbhag same hai. Naya caption likhein.`,
    });
  }
  return out;
}

export function formatFindings(findings: Finding[]): string {
  if (!findings.length) return "Pre-flight: no problems found.";
  const fix = findings.filter((f) => f.severity === "fix");
  const check = findings.filter((f) => f.severity === "check");
  const lines = [`Pre-flight: ${fix.length} to fix, ${check.length} to check.`];
  for (const f of [...fix, ...check]) {
    lines.push(`- [${f.severity === "fix" ? "FIX" : "CHECK"}] ${f.en}`, `  Roman Urdu: ${f.ur}`);
  }
  return lines.join("\n");
}
