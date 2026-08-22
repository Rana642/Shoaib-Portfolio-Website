import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Receipt } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { getSettings } from "@/lib/dashboard/settings";
import {
  setQuotationStatus,
  convertQuotationToInvoice,
  deleteDocument,
} from "@/lib/dashboard/actions/documents";
import { StatusBadge } from "@/components/dashboard/ui";
import DocumentPreview from "@/components/dashboard/DocumentPreview";
import DocumentActions from "@/components/dashboard/DocumentActions";
import DeleteButton from "@/components/dashboard/DeleteButton";
import type { Client, LineItem, Quotation } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";

const statusOptions = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
];

export default async function QuotationPage({ params }: PageProps<"/dashboard/quotations/[id]">) {
  const { id } = await params;

  const [{ data: quotation }, { data: itemsData }, settings] = await Promise.all([
    db.from("quotations").select("*, clients(*)").eq("id", id).single(),
    db.from("quotation_items").select("*").eq("quotation_id", id).order("sort_order"),
    getSettings(),
  ]);

  if (!quotation) notFound();

  const quote = quotation as Quotation & { clients: Client };
  const items = (itemsData ?? []) as LineItem[];

  const { data: linkedInvoice } = await db
    .from("invoices")
    .select("id, number")
    .eq("quotation_id", id)
    .maybeSingle();

  async function changeStatus(status: string) {
    "use server";
    return setQuotationStatus(id, status as never);
  }

  async function convert() {
    "use server";
    return convertQuotationToInvoice(id);
  }

  async function handleDelete() {
    "use server";
    return deleteDocument("quotation", id);
  }

  return (
    <>
      <div className="print:hidden">
        <Link
          href="/dashboard/quotations"
          className="group inline-flex items-center gap-2 text-small text-ink-subtle hover:text-ink transition-colors mb-6"
        >
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
          All quotations
        </Link>

        <div className="flex flex-wrap items-center gap-4 mb-6">
          <h1 className="font-serif italic text-h2">{quote.number}</h1>
          <StatusBadge status={quote.status} />
        </div>

        {linkedInvoice && (
          <Link
            href={`/dashboard/invoices/${linkedInvoice.id}`}
            className="inline-flex items-center gap-2 text-small bg-cobalt/8 border border-cobalt/20 rounded-lg px-4 py-2.5 mb-6 hover:border-cobalt/40 transition-colors"
          >
            <Receipt className="size-4 text-cobalt" aria-hidden />
            Converted to invoice {linkedInvoice.number}
          </Link>
        )}

        <div className="mb-8">
          <DocumentActions
            editHref={`/dashboard/quotations/${id}/edit`}
            statusOptions={statusOptions}
            currentStatus={quote.status}
            onStatusChange={changeStatus}
            convertAction={
              quote.status === "accepted" && !linkedInvoice ? convert : undefined
            }
            convertLabel="Convert to invoice"
          />
          {quote.status !== "accepted" && !linkedInvoice && (
            <p className="text-small text-ink-subtle mt-3">
              Mark this quotation accepted to convert it into an invoice.
            </p>
          )}
        </div>
      </div>

      <DocumentPreview
        kind="quotation"
        document={quote}
        client={quote.clients}
        items={items}
        settings={settings}
      />

      <div className="mt-10 pt-8 border-t border-ink/10 print:hidden">
        <DeleteButton action={handleDelete} label="Delete quotation" />
      </div>
    </>
  );
}
