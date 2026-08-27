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
  const bundleMembers: Record<string, string[]> = {};
  for (const row of memberRows ?? []) {
    const name = nameById.get(row.member_id);
    if (!name) continue;
    (bundleMembers[row.bundle_id] ??= []).push(name);
  }

  return {
    clients: (clients ?? []) as Client[],
    catalog: items,
    bundleMembers,
    settings,
  };
}
