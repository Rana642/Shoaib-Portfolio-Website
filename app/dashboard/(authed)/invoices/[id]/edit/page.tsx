import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { getDocumentFormData } from "@/lib/dashboard/documents";
import { PageHeader } from "@/components/dashboard/ui";
import DocumentForm from "@/components/dashboard/DocumentForm";
import type { Invoice, LineItem } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";

export default async function EditInvoicePage({
  params,
  searchParams,
}: PageProps<"/dashboard/invoices/[id]/edit">) {
  const { id } = await params;
  // "Add add-on" on the invoice page opens this form with an add-on line ready.
  const { addon } = await searchParams;

  const [{ data: invoiceData }, { data: itemsData }, formData] = await Promise.all([
    db.from("invoices").select("*").eq("id", id).single(),
    db.from("invoice_items").select("*").eq("invoice_id", id).order("sort_order"),
    getDocumentFormData(),
  ]);

  if (!invoiceData) notFound();

  const invoice = invoiceData as Invoice;
  const items = (itemsData ?? []) as LineItem[];

  return (
    <>
      <Link
        href={`/dashboard/invoices/${id}`}
        className="group inline-flex items-center gap-2 text-small text-ink-subtle hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
        Back to {invoice.number}
      </Link>

      <PageHeader title={`Edit ${invoice.number}`} />

      <DocumentForm
        kind="invoice"
        clients={formData.clients}
        catalog={formData.catalog}
        bundleMembers={formData.bundleMembers}
        bundleTotals={formData.bundleTotals}
        settings={formData.settings}
        startWithAddon={addon === "1"}
        document={{
          id: invoice.id,
          client_id: invoice.client_id,
          issue_date: invoice.issue_date,
          due_date: invoice.due_date,
          currency: invoice.currency,
          tax_enabled: invoice.tax_enabled,
          tax_name: invoice.tax_name,
          tax_rate: Number(invoice.tax_rate),
          discount_enabled: Number(invoice.discount_value ?? 0) > 0,
          discount_type: invoice.discount_type ?? "percentage",
          discount_value: Number(invoice.discount_value ?? 0),
          notes: invoice.notes,
          terms: invoice.terms,
          items: items.map((item) => ({
            catalog_item_id: item.catalog_item_id,
            description: item.description,
            quantity: Number(item.quantity),
            rate: Number(item.rate),
            is_complimentary: Boolean(item.is_complimentary),
            line_kind: item.line_kind ?? "service",
            addon_discount: Boolean(item.addon_discount),
            addon_tax: Boolean(item.addon_tax),
          })),
        }}
      />
    </>
  );
}
