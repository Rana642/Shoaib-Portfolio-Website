/*
 * Countable catalog services (catalog_items.count_label / count_default,
 * e.g. "posts" / 16). The count on a document line isn't a column: it lives
 * in the line's description text as the first number followed, within three
 * words, by the unit label — "16 designed posts", "16 custom-designed social
 * media posts". Reading and writing it here keeps proposals, quotations and
 * invoices in step.
 */
import type { CatalogItem } from "./types";

const escapeRegExp = (text: string) => text.replace(/[^\w\s-]/g, "\\$&");

const countPattern = (label: string) =>
  new RegExp(String.raw`\b(\d+)(?=(?:\s+[\w-]+){0,3}\s+` + escapeRegExp(label) + String.raw`\b)`, "i");

export function readCount(description: string, label: string): number | null {
  const match = description.match(countPattern(label));
  return match ? Number(match[1]) : null;
}

export function writeCount(description: string, label: string, count: number): string {
  const safe = Math.max(1, Math.round(count));
  return countPattern(label).test(description)
    ? description.replace(countPattern(label), String(safe))
    : `${description} (${safe} ${label})`;
}

/** The count config for a line, when the catalog service it came from is countable. */
export function countableFor(catalog: CatalogItem[], catalogItemId: string | null) {
  const source = catalogItemId ? catalog.find((c) => c.id === catalogItemId) : undefined;
  return source?.count_label ? { label: source.count_label, fallback: source.count_default ?? 1 } : null;
}
