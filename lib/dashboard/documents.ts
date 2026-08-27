import { db } from "./db";
import { getSettings } from "./settings";
import type { CatalogItem, Client } from "./types";

/** Everything the create/edit form needs, in one round of queries. */
export async function getDocumentFormData() {
  const [{ data: clients }, { data: catalog }, { data: memberRows }, settings] = await Promise.all([
    db.from("clients").select("*").eq("is_active", true).order("name"),
    db.from("catalog_items").select("*").order("sort_order").order("name"),
    db.from("catalog_bundle_members").select("bundle_id, member_id"),
    getSettings(),
  ]);

  const items = (catalog ?? []) as CatalogItem[];
  const nameById = new Map(items.map((i) => [i.id, i.name]));
  const rateById = new Map(items.map((i) => [i.id, Number(i.default_rate)]));
  const bundleMembers: Record<string, string[]> = {};
  const bundleTotals: Record<string, number> = {};
  for (const row of memberRows ?? []) {
    const name = nameById.get(row.member_id);
    if (!name) continue;
    (bundleMembers[row.bundle_id] ??= []).push(name);
    bundleTotals[row.bundle_id] = (bundleTotals[row.bundle_id] ?? 0) + (rateById.get(row.member_id) ?? 0);
  }

  return {
    clients: (clients ?? []) as Client[],
    catalog: items,
    bundleMembers,
    bundleTotals,
    settings,
  };
}
