import { PageHeader, EmptyState } from "@/components/dashboard/ui";
import ReceiptReview from "@/components/dashboard/ReceiptReview";
import { listReceipts, openInvoices } from "@/lib/dashboard/receipts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment receipts" };

export default async function ReceiptsPage() {
  const [receipts, invoices] = await Promise.all([listReceipts(), openInvoices()]);
  const pending = receipts.filter((r) => r.status === "pending");
  const reviewed = receipts.filter((r) => r.status !== "pending");

  return (
    <>
      <PageHeader
        title="Payment receipts"
        description="Transfer receipts clients uploaded on their invoice link or on adsbyshoaib.com/pay. Check your bank, then confirm or reject."
      />
      {receipts.length === 0 ? (
        <EmptyState title="No receipts yet" description="When a client uploads a payment receipt, it shows up here and you get an email." />
      ) : (
        <div className="space-y-8 max-w-3xl">
          <section>
            <h2 className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-3">To confirm ({pending.length})</h2>
            {pending.length === 0 ? (
              <p className="text-small text-ink-muted">All caught up.</p>
            ) : (
              <div className="space-y-4">
                {pending.map((r) => (
                  <ReceiptReview key={r.id} receipt={r} invoices={invoices} />
                ))}
              </div>
            )}
          </section>
          {reviewed.length > 0 && (
            <section>
              <h2 className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-3">Reviewed</h2>
              <div className="space-y-4">
                {reviewed.map((r) => (
                  <ReceiptReview key={r.id} receipt={r} invoices={invoices} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
