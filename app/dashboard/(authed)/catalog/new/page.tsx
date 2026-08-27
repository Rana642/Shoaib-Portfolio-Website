import { PageHeader } from "@/components/dashboard/ui";
import CatalogForm from "@/components/dashboard/CatalogForm";
import { getSettings } from "@/lib/dashboard/settings";
import { db } from "@/lib/dashboard/db";
import type { CatalogItem } from "@/lib/dashboard/types";

export const metadata = { title: "New catalog item" };
export const dynamic = "force-dynamic";

export default async function NewCatalogItemPage() {
  const [settings, { data: otherItems }] = await Promise.all([
    getSettings(),
    db.from("catalog_items").select("*").eq("is_bundle", false).order("sort_order").order("name"),
  ]);
  return (
    <>
      <PageHeader title="New catalog item" />
      <CatalogForm
        otherItems={(otherItems ?? []) as CatalogItem[]}
        defaultCurrency={settings.default_currency}
      />
    </>
  );
}
