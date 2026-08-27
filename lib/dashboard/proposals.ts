import { db } from "./db";
import { getSettings } from "./settings";
import type { CatalogItem, Client, ClientProject } from "./types";

/** Everything the create/edit proposal form needs, in one round of queries. */
export async function getProposalFormData() {
  const [{ data: clients }, { data: catalog }, { data: memberRows }, { data: clientProjectRows }, settings] =
    await Promise.all([
      db.from("clients").select("*").eq("is_active", true).order("name"),
      db.from("catalog_items").select("*").order("sort_order").order("name"),
      db.from("catalog_bundle_members").select("bundle_id, member_id"),
      db.from("client_projects").select("*").order("sort_order"),
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

  const clientProjects: Record<string, ClientProject[]> = {};
  for (const row of (clientProjectRows ?? []) as ClientProject[]) {
    (clientProjects[row.client_id] ??= []).push(row);
  }

  return {
    clients: (clients ?? []) as Client[],
    catalog: items,
    bundleMembers,
    clientProjects,
    settings,
  };
}
