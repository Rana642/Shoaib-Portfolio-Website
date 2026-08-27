import { db } from "./db";
import type { CatalogItem } from "./types";

/** Every catalog item, split into single services and bundles, plus a
 *  bundle id -> included service names map for display. Shared by the
 *  Single Services and Bundle Services catalog pages. */
export async function getCatalogSplitByBundle() {
  const [{ data }, { data: memberRows }] = await Promise.all([
    db.from("catalog_items").select("*").order("sort_order").order("name"),
    db.from("catalog_bundle_members").select("bundle_id, member_id"),
  ]);
  const items = (data ?? []) as CatalogItem[];

  const nameById = new Map(items.map((i) => [i.id, i.name]));
  const membersByBundle = new Map<string, string[]>();
  for (const row of memberRows ?? []) {
    const name = nameById.get(row.member_id);
    if (!name) continue;
    membersByBundle.set(row.bundle_id, [...(membersByBundle.get(row.bundle_id) ?? []), name]);
  }

  return {
    singleServices: items.filter((i) => !i.is_bundle),
    bundleServices: items.filter((i) => i.is_bundle),
    membersByBundle,
  };
}
