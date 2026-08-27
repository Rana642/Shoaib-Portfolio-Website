import { formatMoney, formatDate } from "@/lib/dashboard/format";
import type { Client, LineItem, Settings } from "@/lib/dashboard/types";

type PreviewDocument = {
  number: string;
  issue_date: string;
  due_date?: string | null;
  valid_until?: string | null;
  currency: string;
  discount_enabled?: boolean;
  discount_type?: "percentage" | "fixed";
  discount_value?: number;
  discount_amount?: number;
  tax_enabled: boolean;
  tax_name: string;
  tax_rate: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  amount_paid?: number;
  notes: string | null;
  terms: string | null;
};

/**
 * The client-facing document. Rendered on screen and printed as-is —
 * print styles live in globals.css under @media print, so browser
 * print-to-PDF produces the branded file without a separate export path.
 */
export default function DocumentPreview({
  kind,
  document,
  client,
  items,
  settings,
}: {
  kind: "quotation" | "invoice";
  document: PreviewDocument;
  client: Client;
  items: LineItem[];
  settings: Settings;
}) {
  const title = kind === "invoice" ? "Invoice" : "Quotation";
  const dateLabel = kind === "invoice" ? "Due date" : "Valid until";
  const dateValue = kind === "invoice" ? document.due_date : document.valid_until;
  const balance = (document.total ?? 0) - (document.amount_paid ?? 0);

  return (
    <div className="bg-white border border-ink/10 rounded-xl p-8 md:p-12 print:border-0 print:rounded-none print:p-0">
      {/* Header */}
      <div className="flex flex-wrap justify-between gap-8 pb-8 border-b-2 border-citrus">
        <div>
          <p className="font-serif italic text-h3 leading-none">
            {settings.business_name}
            <span className="text-citrus not-italic font-sans">.</span>
          </p>
          <div className="text-small text-ink-muted mt-3 space-y-0.5">
            {settings.business_address && <p>{settings.business_address}</p>}
            {settings.business_email && <p>{settings.business_email}</p>}
            {settings.business_phone && <p>{settings.business_phone}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">{title}</p>
          <p className="font-serif italic text-h3 mt-1 leading-none">{document.number}</p>
          <div className="text-small text-ink-muted mt-3 space-y-0.5">
            <p>Issued {formatDate(document.issue_date)}</p>
            {dateValue && (
              <p>
                {dateLabel} {formatDate(dateValue)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Bill to */}
      <div className="py-8">
        <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
          {kind === "invoice" ? "Bill to" : "Prepared for"}
        </p>
        <p className="text-body-lg font-semibold mt-2">{client.name}</p>
        <div className="text-small text-ink-muted mt-1 space-y-0.5">
          {client.contact_person && <p>{client.contact_person}</p>}
          {client.address && <p className="whitespace-pre-line">{client.address}</p>}
          {client.country && <p>{client.country}</p>}
          {client.email && <p>{client.email}</p>}
        </div>
      </div>

      {/* Items */}
      <table className="w-full text-left">
        <thead>
          <tr className="border-y border-ink/10">
            <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle py-3 pr-4">
              Description
            </th>
            <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle py-3 px-3 text-right whitespace-nowrap">
              Qty
            </th>
            <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle py-3 px-3 text-right whitespace-nowrap">
              Rate
            </th>
            <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle py-3 pl-3 text-right whitespace-nowrap">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-ink/5">
              <td className="py-4 pr-4 text-body whitespace-pre-line">{item.description}</td>
              <td className="py-4 px-3 text-body text-right whitespace-nowrap">
                {Number(item.quantity)}
              </td>
              <td className="py-4 px-3 text-body text-right whitespace-nowrap">
                {formatMoney(Number(item.rate), document.currency)}
              </td>
              <td className="py-4 pl-3 text-body text-right font-medium whitespace-nowrap">
                {formatMoney(Number(item.amount), document.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end mt-6">
        <div className="w-full max-w-xs space-y-2.5">
          <div className="flex justify-between text-body">
            <span className="text-ink-muted">Subtotal</span>
            <span>{formatMoney(Number(document.subtotal), document.currency)}</span>
          </div>
          {document.discount_enabled && Number(document.discount_amount ?? 0) > 0 && (
            <div className="flex justify-between text-body">
              <span className="text-ink-muted">
                Discount
                {document.discount_type === "percentage" ? ` (${Number(document.discount_value)}%)` : ""}
              </span>
              <span>−{formatMoney(Number(document.discount_amount), document.currency)}</span>
            </div>
          )}
          {document.tax_enabled && (
            <div className="flex justify-between text-body">
              <span className="text-ink-muted">
                {document.tax_name} ({Number(document.tax_rate)}%)
              </span>
              <span>{formatMoney(Number(document.tax_amount), document.currency)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2.5 border-t-2 border-ink">
            <span className="font-semibold">Total</span>
            <span className="font-serif italic text-h3 leading-none">
              {formatMoney(Number(document.total), document.currency)}
            </span>
          </div>

          {kind === "invoice" && Number(document.amount_paid ?? 0) > 0 && (
            <>
              <div className="flex justify-between text-body pt-1">
                <span className="text-ink-muted">Paid</span>
                <span>
                  −{formatMoney(Number(document.amount_paid), document.currency)}
                </span>
              </div>
              <div className="flex justify-between pt-2.5 border-t border-ink/20">
                <span className="font-semibold">Balance due</span>
                <span className="font-semibold">
                  {formatMoney(balance, document.currency)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer blocks */}
      {(document.notes || document.terms || (kind === "invoice" && settings.bank_details)) && (
        <div className="mt-10 pt-8 border-t border-ink/10 grid grid-cols-1 md:grid-cols-2 gap-8">
          {document.notes && (
            <div>
              <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-2">
                Notes
              </p>
              <p className="text-small text-ink-muted whitespace-pre-line">{document.notes}</p>
            </div>
          )}
          {document.terms && (
            <div>
              <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-2">
                Terms
              </p>
              <p className="text-small text-ink-muted whitespace-pre-line">{document.terms}</p>
            </div>
          )}
          {kind === "invoice" && settings.bank_details && (
            <div>
              <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-2">
                Payment details
              </p>
              <p className="text-small text-ink-muted whitespace-pre-line">
                {settings.bank_details}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
