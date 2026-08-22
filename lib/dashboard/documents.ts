import { db } from "./db";
import { getSettings } from "./settings";
import type { CatalogItem, Client } from "./types";

/** Everything the create/edit form needs, in one round of queries. */
export async function getDocumentFormData() {
  const [{ data: clients }, { data: catalog }, settings] = await Promise.all([
    db.from("clients").select("*").eq("is_active", true).order("name"),
    db.from("catalog_items").select("*").order("sort_order").order("name"),
    getSettings(),
  ]);

  return {
    clients: (clients ?? []) as Client[],
    catalog: (catalog ?? []) as CatalogItem[],
    settings,
  };
}
