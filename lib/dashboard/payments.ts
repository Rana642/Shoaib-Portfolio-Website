import "server-only";
import { db } from "./db";
import { round2 } from "./format";

/**
 * Adds a payment to an invoice and re-derives the invoice's amount_paid and
 * status from the payments table (never incremented, so a deleted or
 * corrected payment can't leave the invoice out of sync). Shared by the
 * "Record payment" form and the receipt Confirm button. Callers check auth.
 */
export async function applyPaymentToInvoice(
  invoiceId: string,
  payment: { amount: number; paid_at: string; method?: string | null; reference?: string | null; notes?: string | null }
): Promise<{ paymentId: string } | { error: string }> {
  const { data: inserted, error: paymentError } = await db
    .from("payments")
    .insert({ invoice_id: invoiceId, ...payment })
    .select("id")
    .single();
  if (paymentError || !inserted) return { error: paymentError?.message ?? "Couldn't record the payment." };

  const { data: payments } = await db.from("payments").select("amount").eq("invoice_id", invoiceId);
  const amountPaid = round2((payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0));

  const { data: invoice } = await db.from("invoices").select("total, status").eq("id", invoiceId).single();
  let status = invoice?.status ?? "sent";
  if (invoice) {
    if (amountPaid >= Number(invoice.total)) status = "paid";
    else if (amountPaid > 0) status = "partially_paid";
  }

  await db
    .from("invoices")
    .update({
      amount_paid: amountPaid,
      status,
      paid_at: status === "paid" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);

  return { paymentId: inserted.id as string };
}
