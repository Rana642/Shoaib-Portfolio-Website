import "server-only";
import { db } from "./db";
import { round2 } from "./format";
import { pkrRate } from "../fx-rate";

/**
 * Adds a payment to an invoice and re-derives the invoice's amount_paid and
 * status from the payments table (never incremented, so a deleted or
 * corrected payment can't leave the invoice out of sync). Shared by the
 * "Record payment" form and the receipt Confirm button. Callers check auth.
 *
 * Also stores the payment in PKR for Finance: the PKR actually received when
 * given, otherwise the amount at that day's rate (editable in Finance → Income).
 */
export async function applyPaymentToInvoice(
  invoiceId: string,
  payment: {
    amount: number;
    paid_at: string;
    method?: string | null;
    reference?: string | null;
    notes?: string | null;
    pkr_amount?: number | null;
  }
): Promise<{ paymentId: string } | { error: string }> {
  const { pkr_amount: pkrGiven, ...fields } = payment;
  const { data: inv } = await db.from("invoices").select("currency").eq("id", invoiceId).maybeSingle();
  const currency = (inv?.currency as string | undefined) ?? "PKR";
  let fx_rate: number | null = currency === "PKR" ? 1 : null;
  let pkr_amount: number | null = currency === "PKR" ? round2(fields.amount) : null;
  if (currency !== "PKR") {
    if (pkrGiven && pkrGiven > 0) {
      pkr_amount = round2(pkrGiven);
      fx_rate = Math.round((pkrGiven / fields.amount) * 10000) / 10000;
    } else {
      fx_rate = await pkrRate(currency, fields.paid_at);
      pkr_amount = fx_rate ? round2(fields.amount * fx_rate) : null;
    }
  }

  let insert = await db
    .from("payments")
    .insert({ invoice_id: invoiceId, ...fields, fx_rate, pkr_amount })
    .select("id")
    .single();
  // Before the Finance SQL is run the PKR columns don't exist — save the payment without them.
  if (insert.error && (insert.error.code === "PGRST204" || insert.error.code === "42703")) {
    insert = await db.from("payments").insert({ invoice_id: invoiceId, ...fields }).select("id").single();
  }
  const { data: inserted, error: paymentError } = insert;
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
