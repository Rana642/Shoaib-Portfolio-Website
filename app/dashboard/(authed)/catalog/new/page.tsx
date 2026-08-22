import { PageHeader } from "@/components/dashboard/ui";
import CatalogForm from "@/components/dashboard/CatalogForm";
import { getSettings } from "@/lib/dashboard/settings";

export const metadata = { title: "New catalog item" };
export const dynamic = "force-dynamic";

export default async function NewCatalogItemPage() {
  const settings = await getSettings();
  return (
    <>
      <PageHeader title="New catalog item" />
      <CatalogForm defaultCurrency={settings.default_currency} />
    </>
  );
}
