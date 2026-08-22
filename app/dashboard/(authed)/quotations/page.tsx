import { Plus } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { PageHeader, EmptyState, LinkButton } from "@/components/dashboard/ui";
import DocumentTable from "@/components/dashboard/DocumentTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quotations" };

export default async function QuotationsPage() {
  const { data } = await db
    .from("quotations")
    .select("id, number, status, issue_date, currency, total, clients(name)")
    .order("created_at", { ascending: false });

  const quotations = (data ?? []) as never[];

  return (
    <>
      <PageHeader
        title="Quotations"
        description="Send a quote, then convert the accepted ones into invoices."
        action={
          <LinkButton href="/dashboard/quotations/new">
            <Plus className="size-4" aria-hidden />
            New quotation
          </LinkButton>
        }
      />

      {quotations.length === 0 ? (
        <EmptyState
          title="No quotations yet"
          description="Build a quote from your catalog, send it, and convert it to an invoice once the client accepts."
          action={<LinkButton href="/dashboard/quotations/new">New quotation</LinkButton>}
        />
      ) : (
        <DocumentTable documents={quotations} basePath="/dashboard/quotations" />
      )}
    </>
  );
}
