import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "./dashboard/db";

/**
 * Two free, key-less sources for post content (Shoaib, 2026-10-09: "Quran Cloud
 * aur Iconify laga do", picked from his public-apis fork):
 *
 *  - Quran Cloud (api.alquran.cloud): the exact Arabic of any ayah, from the Tanzil
 *    quran-simple text. Arabic is NEVER typed by hand (on 2026-10-03, hand-typed ayat
 *    differed from the source in 16 of 17 cases). kb_add_verified_ayah copies the
 *    source's characters into the global rule `occasion-posts` (verified_texts), the only
 *    place Jummah/occasion posts may take Arabic from.
 *  - Iconify (api.iconify.design): correct SVG icons from 200+ open icon sets, such as the
 *    real WhatsApp glyph. A hand-drawn outline version once read as a scribble on a footer.
 *
 * The server only ever calls these two fixed hosts.
 */

const QURAN_API = "https://api.alquran.cloud/v1";
const ICONIFY_API = "https://api.iconify.design";
const ARABIC_EDITION = "quran-simple"; // the text the existing verified_texts use
const DEFAULT_TRANSLATIONS = ["en.sahih", "ur.jalandhry"];
const TRANSLATION_NOTE =
  "Translations are for understanding only: they are copyrighted. On posts, use our own plain-English meaning (and Urdu only once Shoaib has verified it), unless Shoaib approves quoting a translator with credit.";

const formatError = (error: unknown) => `Error: ${error instanceof Error ? error.message : String(error)}`;
const fail = (error: unknown) => ({ content: [{ type: "text" as const, text: formatError(error) }], isError: true as const });
const ok = (text: string, structured?: Record<string, unknown>) => ({
  content: [{ type: "text" as const, text }],
  ...(structured ? { structuredContent: structured } : {}),
});

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Accept: "application/json" } });
  const body = (await res.json().catch(() => null)) as { code?: number; data?: unknown; status?: string } | null;
  if (!res.ok || !body) throw new Error(`${new URL(url).host} answered ${res.status}${body && typeof body.data === "string" ? `: ${body.data}` : ""}`);
  return body as T;
}

// ── Quran ─────────────────────────────────────────────────────

type QuranEdition = { identifier: string; language: string; englishName: string; type: string };
type QuranAyah = {
  text: string;
  numberInSurah: number;
  edition: QuranEdition;
  surah: { number: number; name: string; englishName: string; englishNameTranslation: string; numberOfAyahs: number };
};

/** "2:152" → [2, 152]; "94:5-6" → [94, 5, 6]. */
function parseRef(ref: string): { surah: number; from: number; to: number } {
  const m = ref.trim().match(/^(\d{1,3})\s*:\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?$/);
  if (!m) throw new Error(`Write the reference as surah:ayah, e.g. "2:152" or "94:5-6" (got "${ref}").`);
  const surah = Number(m[1]), from = Number(m[2]), to = Number(m[3] ?? m[2]);
  if (surah < 1 || surah > 114) throw new Error("The surah number must be 1–114.");
  if (to < from) throw new Error("The range must go forward, e.g. 94:5-6.");
  if (to - from > 9) throw new Error("At most 10 ayat at a time.");
  return { surah, from, to };
}

/** Waqf / pause marks stand between words. They are not words themselves. */
const isMark = (token: string) => /^[ۖ-ۜ۞۩]+$/.test(token);
const words = (arabic: string) => arabic.split(/\s+/).filter((t) => t && !isMark(t));

/** The exact source characters for words from…to (1-based), keeping any pause mark between them. */
function excerpt(arabic: string, from: number, to: number): string {
  const tokens = arabic.split(/\s+/).filter(Boolean);
  let n = 0, start = -1, end = -1;
  tokens.forEach((t, i) => {
    if (isMark(t)) return;
    n++;
    if (n === from) start = i;
    if (n === to) end = i;
  });
  if (start < 0 || end < 0) throw new Error(`This ayah has ${n} words. Choose words within 1–${n}.`);
  return tokens.slice(start, end + 1).join(" ");
}

/** "سُورَةُ الطَّلَاقِ" → "سورۃ الطلاق", the Urdu spelling the verified texts use. */
const urduSurahName = (arabicName: string) => arabicName.replace(/[ً-ْٰـ]/g, "").replace(/^سورة/, "سورۃ");

async function fetchAyah(surah: number, ayah: number, editions: string[]): Promise<QuranAyah[]> {
  const body = await getJson<{ data: QuranAyah[] | QuranAyah }>(`${QURAN_API}/ayah/${surah}:${ayah}/editions/${editions.map(encodeURIComponent).join(",")}`);
  return Array.isArray(body.data) ? body.data : [body.data];
}

// ── Iconify ───────────────────────────────────────────────────

type IconCollection = { name: string; total?: number; license?: { title: string; spdx?: string; url?: string }; author?: { name: string } };
const ICON_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_ICON_SETS = "lucide,tabler,mdi,ph,material-symbols,healthicons,fluent,simple-icons";

async function iconLicenses(prefixes: string[]): Promise<Record<string, IconCollection>> {
  if (!prefixes.length) return {};
  return getJson<Record<string, IconCollection>>(`${ICONIFY_API}/collections?prefixes=${encodeURIComponent(prefixes.join(","))}`);
}

export function registerContentTools(server: McpServer): void {
  const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

  server.registerTool(
    "quran_get_ayah",
    {
      title: "Get Quran Ayah (exact Arabic)",
      description: `Fetches the exact Arabic of an ayah, or of up to 10 ayat in a row, from Quran Cloud (Tanzil quran-simple, the text our verified_texts use). It also returns translations to help understand the meaning, and the ayah's words numbered for picking a short excerpt.

Never type or retype Arabic yourself. To use an ayah on a post, save it with kb_add_verified_ayah, which copies these exact characters.

Args:
  - reference (string): surah:ayah, e.g. "2:152" or "94:5-6".
  - translations (string[], optional): Quran Cloud edition ids. The default is ["en.sahih", "ur.jalandhry"] (Saheeh International and Fateh Muhammad Jalandhry). Others include "en.pickthall", "ur.maududi" and "ur.junagarhi".
  - script ("simple" | "uthmani", default "simple").

${TRANSLATION_NOTE}`,
      inputSchema: {
        reference: z.string().min(3).max(12),
        translations: z.array(z.string().regex(/^[a-z]{2}\.[a-z0-9-]+$/)).max(4).optional(),
        script: z.enum(["simple", "uthmani"]).optional(),
      },
      annotations: READ,
    },
    async ({ reference, translations, script = "simple" }: { reference: string; translations?: string[]; script?: "simple" | "uthmani" }) => {
      try {
        const { surah, from, to } = parseRef(reference);
        const arabicEdition = script === "uthmani" ? "quran-uthmani" : ARABIC_EDITION;
        const eds = [arabicEdition, ...(translations ?? DEFAULT_TRANSLATIONS)];
        const ayat = await Promise.all(Array.from({ length: to - from + 1 }, (_, i) => fetchAyah(surah, from + i, eds)));
        const lines: string[] = [];
        const out = ayat.map((editions) => {
          const ar = editions.find((e) => e.edition.identifier === arabicEdition)!;
          const s = ar.surah;
          const ref = `${s.number}:${ar.numberInSurah}`;
          const tr = editions.filter((e) => e !== ar).map((e) => ({ edition: e.edition.identifier, translator: e.edition.englishName, text: e.text }));
          const numbered = words(ar.text).map((w, i) => `${i + 1} ${w}`);
          lines.push(
            `## Surah ${s.englishName} (${s.englishNameTranslation}) ${ref}`,
            `Arabic (${arabicEdition}, exact source characters):`,
            ar.text,
            `Words: ${numbered.join(" | ")}`,
            ...tr.map((t) => `${t.translator} [${t.edition}]: ${t.text}`),
            `quran.com: https://quran.com/${s.number}/${ar.numberInSurah}`,
            ""
          );
          return {
            reference: ref,
            surah: { number: s.number, name_ar: s.name, name_en: s.englishName, meaning: s.englishNameTranslation, ayat: s.numberOfAyahs },
            arabic: ar.text,
            arabic_edition: arabicEdition,
            words: words(ar.text),
            translations: tr,
            link: `https://quran.com/${s.number}/${ar.numberInSurah}`,
          };
        });
        lines.push(TRANSLATION_NOTE);
        return ok(lines.join("\n"), { ayat: out, note: TRANSLATION_NOTE });
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "quran_search",
    {
      title: "Search The Quran By Word",
      description: `Finds ayat by a word or short phrase through Quran Cloud. For example, search "trust" or "patience" in an English translation to find ayat for a theme, then read the full Arabic with quran_get_ayah.

Args:
  - keyword (string): one word or a short phrase.
  - edition (string, default "en.sahih"): the translation to search in. Use "quran-simple-clean" to search Arabic without diacritics.
  - surah (number, optional): limit the search to one surah.
  - limit (number, default 15, max 40).`,
      inputSchema: {
        keyword: z.string().min(2).max(60),
        edition: z.string().regex(/^[a-z]{2,6}[.-][a-z0-9-]+$/).optional(),
        surah: z.number().int().min(1).max(114).optional(),
        limit: z.number().int().min(1).max(40).optional(),
      },
      annotations: READ,
    },
    async ({ keyword, edition = "en.sahih", surah, limit = 15 }: { keyword: string; edition?: string; surah?: number; limit?: number }) => {
      try {
        type Match = { text: string; numberInSurah: number; surah: { number: number; englishName: string } };
        const res = await fetch(`${QURAN_API}/search/${encodeURIComponent(keyword.trim())}/${surah ?? "all"}/${encodeURIComponent(edition)}`, { signal: AbortSignal.timeout(15000) });
        const body = (await res.json().catch(() => null)) as { data?: { count: number; matches: Match[] } | string } | null;
        // Quran Cloud answers 404 when nothing matches
        if (res.status === 404 || !body || typeof body.data !== "object" || !body.data) return ok(`No ayat match "${keyword}" in ${edition}.`, { count: 0, matches: [] });
        const matches = body.data.matches.slice(0, limit).map((m) => ({ reference: `${m.surah.number}:${m.numberInSurah}`, surah: m.surah.englishName, text: m.text }));
        const lines = [`# "${keyword}" in ${edition}: ${body.data.count} match(es), showing ${matches.length}`, ...matches.map((m) => `- ${m.reference} (${m.surah}): ${m.text}`), "", "Read the exact Arabic with quran_get_ayah before using any of them.", TRANSLATION_NOTE];
        return ok(lines.join("\n"), { count: body.data.count, matches });
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_add_verified_ayah",
    {
      title: "Add A Quran Text To verified_texts",
      description: `Saves an ayah, or a short excerpt of one, to the global rule \`occasion-posts\` as a verified text, so kb_get_occasion_post can use it on Jummah and occasion posts. The Arabic is copied character for character from Quran Cloud (Tanzil quran-simple). You never type it.

Args:
  - id (string): a short snake_case key, e.g. "sabr_jameel".
  - reference (string): one ayah, e.g. "65:3".
  - words (string, optional): an excerpt by word numbers from quran_get_ayah, e.g. "6-11". Leave it out for the whole ayah.
  - type ("ayah" | "dua", default "ayah").
  - english (string): OUR OWN plain-English meaning, checked against translations but not copied from one.
  - urdu (string, optional): only an Urdu meaning Shoaib has verified. Otherwise leave it out (null = English posts only).
  - occasions (string[], optional): occasion keys to list it under, e.g. ["jummah"].
  - overwrite (boolean, default false): replace an existing id.
  - confirm (boolean): when false or left out, nothing is saved and a preview is returned.`,
      inputSchema: {
        id: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
        reference: z.string().min(3).max(8),
        words: z.string().regex(/^\d{1,3}-\d{1,3}$/).optional(),
        type: z.enum(["ayah", "dua"]).optional(),
        english: z.string().min(3).max(400),
        urdu: z.string().min(2).max(400).optional(),
        occasions: z.array(z.string().regex(/^[a-z_]+$/)).max(10).optional(),
        overwrite: z.boolean().optional(),
        confirm: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a: { id: string; reference: string; words?: string; type?: "ayah" | "dua"; english: string; urdu?: string; occasions?: string[]; overwrite?: boolean; confirm?: boolean }) => {
      try {
        const { surah, from, to } = parseRef(a.reference);
        if (from !== to) throw new Error("Save one ayah at a time. A verified text is one ayah or an excerpt of one.");
        const [ar] = await fetchAyah(surah, from, [ARABIC_EDITION]);
        let arabic = ar.text;
        if (a.words) {
          const [w1, w2] = a.words.split("-").map(Number);
          if (w2 < w1) throw new Error("words must go forward, e.g. 6-11.");
          arabic = excerpt(ar.text, w1, w2);
        }
        const s = ar.surah;
        const entry = {
          type: a.type ?? "ayah",
          arabic,
          english: a.english.trim(),
          reference: `Surah ${s.englishName} ${s.number}:${from}`,
          reference_ur: `${urduSurahName(s.name)} ${s.number}:${from}`,
          urdu: a.urdu?.trim() ?? null,
          source: `https://quran.com/${s.number}/${from} (text: Tanzil quran-simple via api.alquran.cloud)`,
          verified: new Date().toISOString().slice(0, 10),
        };

        const { data: row } = await db.from("kb_global_docs").select("content").eq("slug", "occasion-posts").maybeSingle();
        if (!row) throw new Error('The global rule "occasion-posts" is missing.');
        const content = (row as { content: string }).content;
        const m = content.match(/```json\s*\n([\s\S]*?)\n```/);
        if (!m) throw new Error("The occasion-posts rule has no ```json block.");
        const data = JSON.parse(m[1]) as { verified_texts: Record<string, unknown>; occasions: Record<string, { texts?: string[] }> };
        if (data.verified_texts[a.id] && !a.overwrite) throw new Error(`"${a.id}" already exists. Pick another id, or pass overwrite: true.`);
        const unknown = (a.occasions ?? []).filter((o) => !data.occasions[o]);
        if (unknown.length) throw new Error(`Unknown occasion key(s): ${unknown.join(", ")}. Known: ${Object.keys(data.occasions).join(", ")}.`);

        const preview = `${a.id}: ${JSON.stringify(entry, null, 2)}${a.occasions?.length ? `\nListed under: ${a.occasions.join(", ")}` : ""}`;
        if (!a.confirm) return ok(`Preview, not saved. Check the excerpt, then call again with confirm: true.\n\n${preview}`, { saved: false, id: a.id, entry });

        data.verified_texts[a.id] = entry;
        for (const o of a.occasions ?? []) {
          const texts = (data.occasions[o].texts ??= []);
          if (!texts.includes(a.id)) texts.push(a.id);
        }
        const next = content.replace(m[0], "```json\n" + JSON.stringify(data, null, 2) + "\n```");
        const { error } = await db.from("kb_global_docs").update({ content: next, updated_at: new Date().toISOString() }).eq("slug", "occasion-posts");
        if (error) throw new Error(error.message);
        return ok(`Saved "${a.id}" to verified_texts (${Object.keys(data.verified_texts).length} texts now).\n\n${preview}`, { saved: true, id: a.id, entry });
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "icon_search",
    {
      title: "Search Icons (Iconify)",
      description: `Searches 200+ open icon sets on Iconify for correct, ready-made SVG icons, so you don't draw your own paths. Use it for footer contact icons, benefit icons, poultry or animal health icons, and so on.

Brand logos such as WhatsApp or Facebook are in "simple-icons" (or "mdi"). Use them only to point to that brand's own channel, such as a WhatsApp number.

Args:
  - query (string): e.g. "whatsapp", "chicken", "syringe", "water drop".
  - prefixes (string, optional): comma-separated icon sets. The default is a set of clean, commercially usable ones: ${DEFAULT_ICON_SETS}.
  - limit (number, default 24, max 64).

Returns the icon ids (prefix:name), each with an SVG link and its set's licence. Fetch one with icon_get_svg.`,
      inputSchema: {
        query: z.string().min(2).max(60),
        prefixes: z.string().regex(/^[a-z0-9-]+(,[a-z0-9-]+)*$/).optional(),
        limit: z.number().int().min(1).max(64).optional(),
      },
      annotations: READ,
    },
    async ({ query, prefixes = DEFAULT_ICON_SETS, limit = 24 }: { query: string; prefixes?: string; limit?: number }) => {
      try {
        const body = await getJson<{ icons: string[]; total: number; collections?: Record<string, IconCollection> }>(
          `${ICONIFY_API}/search?query=${encodeURIComponent(query.trim())}&limit=${Math.max(limit, 32)}&prefixes=${encodeURIComponent(prefixes)}`
        );
        const icons = body.icons.slice(0, limit);
        const sets = body.collections ?? {};
        const rows = icons.map((id) => {
          const [prefix, name] = id.split(":");
          const c = sets[prefix];
          return { id, svg: `${ICONIFY_API}/${prefix}/${name}.svg`, set: c?.name ?? prefix, license: c?.license?.spdx ?? c?.license?.title ?? "unknown" };
        });
        const lines = [`# Icons for "${query}": ${body.total} found, showing ${rows.length}`, ...rows.map((r) => `- ${r.id} (${r.set}, ${r.license}): ${r.svg}`)];
        if (!rows.length) lines.push("Nothing found. Try a simpler or English word, or other prefixes.");
        return ok(lines.join("\n"), { total: body.total, icons: rows });
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "icon_get_svg",
    {
      title: "Get Icon SVG (Iconify)",
      description: `Returns one Iconify icon as ready-to-use SVG markup, optionally recoloured and resized, with its set's licence. Paste the SVG into a design or rendering script instead of hand-drawing an icon.

Args:
  - icon (string): "prefix:name" from icon_search, e.g. "simple-icons:whatsapp" or "lucide:phone".
  - color (string, optional): a hex colour such as "#FFFFFF". The default keeps "currentColor".
  - height (number, optional): pixel height (the width follows the icon's proportions).`,
      inputSchema: {
        icon: z.string().regex(ICON_ID),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        height: z.number().int().min(8).max(1024).optional(),
      },
      annotations: READ,
    },
    async ({ icon, color, height }: { icon: string; color?: string; height?: number }) => {
      try {
        const [prefix, name] = icon.split(":");
        const params = new URLSearchParams();
        if (color) params.set("color", color);
        if (height) params.set("height", String(height));
        const url = `${ICONIFY_API}/${prefix}/${name}.svg${params.size ? `?${params}` : ""}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        const svg = await res.text();
        if (!res.ok || !svg.startsWith("<svg")) throw new Error(`Iconify has no icon "${icon}" (${res.status}). Find the exact id with icon_search.`);
        const lic = (await iconLicenses([prefix]))[prefix];
        const license = lic?.license ? `${lic.license.title}${lic.license.url ? ` (${lic.license.url})` : ""}` : "unknown";
        return ok(`${icon} from ${lic?.name ?? prefix}, licence: ${license}\nURL: ${url}\n\n${svg}`, { icon, set: lic?.name ?? prefix, license, url, svg });
      } catch (error) {
        return fail(error);
      }
    }
  );
}
