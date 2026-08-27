import { Plus } from "lucide-react";
import { getCatalogSplitByBundle } from "@/lib/dashboard/catalog";
import { PageHeader, EmptyState, LinkButton } from "@/components/dashboard/ui";
import CatalogTable from "@/components/dashboard/CatalogTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bundle Services" };

export default async function CatalogBundlesPage() {
  const { bundleServices, membersByBundle } = await getCatalogSplitByBundle();

  return (
    <>
      <PageHeader
        title="Bundle Services"
        description="Package several services into one named offer with its own price."
        action={
          <LinkButton href="/dashboard/catalog/new?type=bundle">
            <Plus className="size-4" aria-hidden />
            Add bundle
          </LinkButton>
        }
      />

      {bundleServices.length === 0 ? (
        <EmptyState
          title="No bundles yet"
          description="Bundle several single services under one name and one price — it shows up as its own item everywhere the catalog does."
          action={<LinkButton href="/dashboard/catalog/new?type=bundle">Add bundle</LinkButton>}
        />
      ) : (
        <CatalogTable items={bundleServices} membersByBundle={membersByBundle} />
      )}
    </>
  );
}
