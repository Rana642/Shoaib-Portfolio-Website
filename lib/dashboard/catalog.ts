import { db } from "./db";
import type { CatalogItem } from "./types";

/** Every catalog item, split into single services and bundles, plus a
 *  bundle id -> included service names map for display, and a bundle id
 *  -> combined total of those services' own rates (for comparing against
 *  the bundle's own price). Shared by the Single Services and Bundle
 *  Services catalog pages. */
export async function getCatalogSplitByBundle() {
  const [{ data }, { data: memberRows }] = await Promise.all([
    db.from("catalog_items").select("*").order("sort_order").order("name"),
    db.from("catalog_bundle_members").select("bundle_id, member_id"),
  ]);
  const items = (data ?? []) as CatalogItem[];

  const nameById = new Map(items.map((i) => [i.id, i.name]));
  const rateById = new Map(items.map((i) => [i.id, Number(i.default_rate)]));
  const membersByBundle = new Map<string, string[]>();
  const bundleTotals = new Map<string, number>();
  for (const row of memberRows ?? []) {
    const name = nameById.get(row.member_id);
    if (!name) continue;
    membersByBundle.set(row.bundle_id, [...(membersByBundle.get(row.bundle_id) ?? []), name]);
    bundleTotals.set(row.bundle_id, (bundleTotals.get(row.bundle_id) ?? 0) + (rateById.get(row.member_id) ?? 0));
  }

  return {
    singleServices: items.filter((i) => !i.is_bundle),
    bundleServices: items.filter((i) => i.is_bundle),
    membersByBundle,
    bundleTotals,
  };
}
