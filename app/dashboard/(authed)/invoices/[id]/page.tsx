import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { getSettings } from "@/lib/dashboard/settings";
import {
  setInvoiceStatus,
  recordPayment,
  deleteDocument,
} from "@/lib/dashboard/actions/documents";
import { formatMoney, formatDate } from "@/lib/dashboard/format";
import { StatusBadge, Card } from "@/components/dashboard/ui";
import DocumentPreview from "@/components/dashboard/DocumentPreview";
import DocumentActions from "@/components/dashboard/DocumentActions";
import PaymentForm from "@/components/dashboard/PaymentForm";
import DeleteButton from "@/components/dashboard/DeleteButton";
import type { Client, Invoice, LineItem, Payment } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";

const statusOptions = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "cancelled", label: "Cancelled" },
];

export default async function InvoicePage({ params }: PageProps<"/dashboard/invoices/[id]">) {
  const { id } = await params;

  const [{ data: invoiceData }, { data: itemsData }, { data: paymentsData }, settings] =
    await Promise.all([
      db.from("invoices").select("*, clients(*), quotations(id, number)").eq("id", id).single(),
      db.from("invoice_items").select("*").eq("invoice_id", id).order("sort_order"),
      db.from("payments").select("*").eq("invoice_id", id).order("paid_at", { ascending: false }),
      getSettings(),
    ]);

  if (!invoiceData) notFound();

  const invoice = invoiceData as Invoice & {
    clients: Client;
    quotations: { id: string; number: string } | null;
  };
  const items = (itemsData ?? []) as LineItem[];
  const payments = (paymentsData ?? []) as Payment[];
  const balanceDue = Number(invoice.total) - Number(invoice.amount_paid);

  async function changeStatus(status: string) {
    "use server";
    return setInvoiceStatus(id, status as never);
  }

  async function addPayment(formData: FormData) {
    "use server";
    return recordPayment(id, formData);
  }

  async function handleDelete() {
    "use server";
    return deleteDocument("invoice", id);
  }

  return (
    <>
      <div className="print:hidden">
        <Link
          href="/dashboard/invoices"
          className="group inline-flex items-center gap-2 text-small text-ink-subtle hover:text-ink transition-colors mb-6"
        >
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
          All invoices
        </Link>

        <div className="flex flex-wrap items-center gap-4 mb-6">
          <h1 className="font-serif italic text-h2">{invoice.number}</h1>
          <StatusBadge status={invoice.status} />
        </div>

        {invoice.quotations && (
          <Link
            href={`/dashboard/quotations/${invoice.quotations.id}`}
            className="inline-flex items-center gap-2 text-small bg-cobalt/8 border border-cobalt/20 rounded-lg px-4 py-2.5 mb-6 hover:border-cobalt/40 transition-colors"
          >
            <FileText className="size-4 text-cobalt" aria-hidden />
            From quotation {invoice.quotations.number}
          </Link>
        )}

        <div className="mb-8">
          <DocumentActions
            editHref={`/dashboard/invoices/${id}/edit`}
            statusOptions={statusOptions}
            currentStatus={invoice.status}
            onStatusChange={changeStatus}
          />
        </div>

        <div className="mb-8">
          {payments.length > 0 && (
            <Card className="p-6 mb-4 max-w-lg">
              <h3 className="text-body-lg font-semibold mb-4">Payments</h3>
              <ul className="space-y-3">
                {payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex justify-between gap-4 pb-3 border-b border-ink/5 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="text-small font-medium">
                        {formatMoney(Number(payment.amount), invoice.currency)}
                      </p>
                      <p className="text-small text-ink-subtle">
                        {formatDate(payment.paid_at)}
                        {payment.method ? ` · ${payment.method}` : ""}
                        {payment.reference ? ` · ${payment.reference}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between mt-4 pt-4 border-t border-ink/10">
                <span className="text-small font-medium">Balance due</span>
                <span className="text-small font-semibold">
                  {formatMoney(balanceDue, invoice.currency)}
                </span>
              </div>
            </Card>
          )}

          {invoice.status !== "cancelled" && balanceDue > 0 && (
            <PaymentForm
              action={addPayment}
              currency={invoice.currency}
              balanceDue={balanceDue}
            />
          )}
        </div>
      </div>

      <DocumentPreview
        kind="invoice"
        document={invoice}
        client={invoice.clients}
        items={items}
        settings={settings}
      />

      <div className="mt-10 pt-8 border-t border-ink/10 print:hidden">
        <DeleteButton action={handleDelete} label="Delete invoice" />
      </div>
    </>
  );
}
