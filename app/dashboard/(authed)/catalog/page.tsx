import { Plus } from "lucide-react";
import { getCatalogSplitByBundle } from "@/lib/dashboard/catalog";
import { PageHeader, EmptyState, LinkButton } from "@/components/dashboard/ui";
import CatalogTable from "@/components/dashboard/CatalogTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Single Services" };

export default async function CatalogPage() {
  const { singleServices, membersByBundle } = await getCatalogSplitByBundle();

  return (
    <>
      <PageHeader
        title="Single Services"
        description="Priced, billable items. Separate from the website's Services pages, which live in Sanity."
        action={
          <LinkButton href="/dashboard/catalog/new">
            <Plus className="size-4" aria-hidden />
            Add item
          </LinkButton>
        }
      />

      {singleServices.length === 0 ? (
        <EmptyState
          title="No services yet"
          description="Add the services you bill for — with rates — and they become one-click line items on quotations and invoices."
          action={<LinkButton href="/dashboard/catalog/new">Add item</LinkButton>}
        />
      ) : (
        <CatalogTable items={singleServices} membersByBundle={membersByBundle} />
      )}
    </>
  );
}
