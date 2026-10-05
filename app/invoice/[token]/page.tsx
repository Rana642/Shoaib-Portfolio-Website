import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/dashboard/db";
import { getAdminUser } from "@/lib/dashboard/auth";
import { getSettings } from "@/lib/dashboard/settings";
import { formatMoney, formatDate } from "@/lib/dashboard/format";
import DocumentPreview from "@/components/dashboard/DocumentPreview";
import PrintButton from "@/components/report/PrintButton";
import type { Client, Invoice, LineItem } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";

// Token-gated client document — never indexed.
export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };

export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{32,80}$/.test(token)) notFound();

  const { data } = await db.from("invoices").select("*, clients(*)").eq("access_token", token).maybeSingle();
  if (!data) notFound();
  const invoice = data as Invoice & { clients: Client };

  // Drafts (and cancelled invoices) exist only for Shoaib.
  if ((invoice.status === "draft" || invoice.status === "cancelled") && !(await getAdminUser())) notFound();

  const [{ data: items }, settings] = await Promise.all([
    db.from("invoice_items").select("*").eq("invoice_id", invoice.id).order("sort_order"),
    getSettings(),
  ]);
  const balance = Number(invoice.total) - Number(invoice.amount_paid);
  const paid = invoice.status === "paid" || balance <= 0;

  return (
    <main className="min-h-full bg-cloud px-5 py-10 md:py-16">
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 print:hidden">
          <p className={`text-small font-medium ${paid ? "text-green-700" : "text-ink"}`}>
            {paid
              ? "Paid. Thank you."
              : `Balance due: ${formatMoney(balance, invoice.currency)}${invoice.due_date ? ` by ${formatDate(invoice.due_date)}` : ""}`}
          </p>
          <PrintButton />
        </div>
        <DocumentPreview kind="invoice" document={invoice} client={invoice.clients} items={(items ?? []) as LineItem[]} settings={settings} />
      </div>
    </main>
  );
}
