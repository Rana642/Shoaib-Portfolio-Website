import { Plus } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { PageHeader, EmptyState, LinkButton } from "@/components/dashboard/ui";
import DocumentTable from "@/components/dashboard/DocumentTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  const { data } = await db
    .from("invoices")
    .select("id, number, status, issue_date, currency, total, amount_paid, clients(name)")
    .order("created_at", { ascending: false });

  const invoices = (data ?? []) as never[];

  return (
    <>
      <PageHeader
        title="Invoices"
        description="What's been billed, and what's still outstanding."
        action={
          <LinkButton href="/dashboard/invoices/new">
            <Plus className="size-4" aria-hidden />
            New invoice
          </LinkButton>
        }
      />

      {invoices.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Create one directly, or convert an accepted quotation into an invoice."
          action={<LinkButton href="/dashboard/invoices/new">New invoice</LinkButton>}
        />
      ) : (
        <DocumentTable documents={invoices} basePath="/dashboard/invoices" />
      )}
    </>
  );
}
