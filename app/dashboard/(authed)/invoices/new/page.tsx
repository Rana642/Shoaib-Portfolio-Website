import { PageHeader, EmptyState, LinkButton } from "@/components/dashboard/ui";
import DocumentForm from "@/components/dashboard/DocumentForm";
import { getDocumentFormData } from "@/lib/dashboard/documents";

export const dynamic = "force-dynamic";
export const metadata = { title: "New invoice" };

export default async function NewInvoicePage() {
  const { clients, catalog, bundleMembers, bundleTotals, settings } = await getDocumentFormData();

  return (
    <>
      <PageHeader title="New invoice" />
      {clients.length === 0 ? (
        <EmptyState
          title="Add a client first"
          description="An invoice has to be addressed to someone — create a client, then come back."
          action={<LinkButton href="/dashboard/clients/new">Add client</LinkButton>}
        />
      ) : (
        <DocumentForm
          kind="invoice"
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
