import { PageHeader, EmptyState, LinkButton } from "@/components/dashboard/ui";
import DocumentForm from "@/components/dashboard/DocumentForm";
import { getDocumentFormData } from "@/lib/dashboard/documents";

export const dynamic = "force-dynamic";
export const metadata = { title: "New quotation" };

export default async function NewQuotationPage() {
  const { clients, catalog, bundleMembers, bundleTotals, settings } = await getDocumentFormData();

  return (
    <>
      <PageHeader title="New quotation" />
      {clients.length === 0 ? (
        <EmptyState
          title="Add a client first"
          description="A quotation has to be addressed to someone — create a client, then come back."
          action={<LinkButton href="/dashboard/clients/new">Add client</LinkButton>}
        />
      ) : (
        <DocumentForm
          kind="quotation"
          clients={clients}
          catalog={catalog}
          bundleMembers={bundleMembers}
          bundleTotals={bundleTotals}
          settings={settings}
        />
      )}
    </>
  );
}
