import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { getDocumentFormData } from "@/lib/dashboard/documents";
import { PageHeader } from "@/components/dashboard/ui";
import DocumentForm from "@/components/dashboard/DocumentForm";
import type { LineItem, Quotation } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";

export default async function EditQuotationPage({
  params,
}: PageProps<"/dashboard/quotations/[id]/edit">) {
  const { id } = await params;

  const [{ data: quotation }, { data: itemsData }, formData] = await Promise.all([
    db.from("quotations").select("*").eq("id", id).single(),
    db.from("quotation_items").select("*").eq("quotation_id", id).order("sort_order"),
    getDocumentFormData(),
  ]);

  if (!quotation) notFound();

  const quote = quotation as Quotation;
  const items = (itemsData ?? []) as LineItem[];

  return (
    <>
      <Link
        href={`/dashboard/quotations/${id}`}
        className="group inline-flex items-center gap-2 text-small text-ink-subtle hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
        Back to {quote.number}
      </Link>

      <PageHeader title={`Edit ${quote.number}`} />

      <DocumentForm
        kind="quotation"
        clients={formData.clients}
        catalog={formData.catalog}
        bundleMembers={formData.bundleMembers}
        bundleTotals={formData.bundleTotals}
        settings={formData.settings}
        document={{
          id: quote.id,
          client_id: quote.client_id,
          issue_date: quote.issue_date,
          due_date: quote.valid_until,
          currency: quote.currency,
          discount_enabled: quote.discount_enabled,
          discount_type: quote.discount_type,
          discount_value: Number(quote.discount_value),
          tax_enabled: quote.tax_enabled,
          tax_name: quote.tax_name,
          tax_rate: Number(quote.tax_rate),
          notes: quote.notes,
          terms: quote.terms,
          items: items.map((item) => ({
            catalog_item_id: item.catalog_item_id,
            description: item.description,
            quantity: Number(item.quantity),
            rate: Number(item.rate),
          })),
        }}
      />
    </>
  );
}
