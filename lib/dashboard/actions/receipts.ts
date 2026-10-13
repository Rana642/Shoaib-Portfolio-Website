"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "../db";
import { getAdminUser } from "../auth";
import { applyPaymentToInvoice } from "../payments";
import { pkrRate } from "../../fx-rate";
import { formatMoney } from "../format";
import { invoiceUrl } from "../billing-send";
import { resend, isResendConfigured, fromEmail, toEmail } from "../../resend";
import { receiptConfirmedEmail, receiptRejectedEmail } from "../../email-templates";
import { siteUrl } from "../../seo";
import type { PaymentReceipt } from "../types";

async function assertAuthed() {
  const user = await getAdminUser();
  if (!user) redirect("/dashboard/login");
}

async function loadPending(id: string) {
  const { data } = await db.from("payment_receipts").select("*").eq("id", id).maybeSingle();
  const receipt = data as PaymentReceipt | null;
  if (!receipt) return { error: "Receipt not found." } as const;
  if (receipt.status !== "pending") return { error: `This receipt is already ${receipt.status}.` } as const;
  return { receipt } as const;
}

function refresh(invoiceId: string | null) {
  revalidatePath("/dashboard/receipts");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/finance");
  revalidatePath("/dashboard/finance/income");
  if (invoiceId) {
    revalidatePath(`/dashboard/invoices/${invoiceId}`);
    revalidatePath("/dashboard/invoices");
  }
}

/**
 * Confirm: the money is in the bank. Records it as a payment on the chosen
 * invoice (amount can be corrected), marks the receipt confirmed and thanks
 * the payer by email. A /pay receipt with no invoice is just marked confirmed.
 */
export async function confirmReceipt(id: string, input: { invoiceId: string | null; amount: number }) {
  await assertAuthed();
  const found = await loadPending(id);
  if ("error" in found) return { error: found.error };
  const r = found.receipt;

  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!(amount > 0)) return { error: "Enter the amount you received." };

  let invoice: { id: string; number: string; currency: string; access_token: string | null } | null = null;
  if (input.invoiceId) {
    const { data } = await db.from("invoices").select("id, number, currency, access_token, status").eq("id", input.invoiceId).maybeSingle();
    if (!data) return { error: "That invoice doesn't exist any more." };
    if (data.status === "cancelled") return { error: "That invoice is cancelled." };
    if (data.currency !== r.currency) return { error: `The receipt is in ${r.currency} but the invoice is in ${data.currency}. Record it by hand instead.` };
    invoice = data;
  }

  let paymentId: string | null = null;
  if (invoice) {
    const applied = await applyPaymentToInvoice(invoice.id, {
      amount,
      paid_at: r.paid_on ?? new Date().toISOString().slice(0, 10),
      method: "Bank transfer (receipt)",
      reference: r.reference,
      notes: r.note,
    });
    if ("error" in applied) return { error: applied.error };
    paymentId = applied.paymentId;
  } else {
    // No invoice to put it on — still money in, so it goes to Finance → Income.
    const paidOn = r.paid_on ?? new Date().toISOString().slice(0, 10);
    const rate = await pkrRate(r.currency, paidOn);
    if (rate) {
      await db.from("finance_entries").insert({
        kind: "income",
        entry_date: paidOn,
        category: "client_payment",
        party: r.payer_name,
        description: r.invoice_number ? `Receipt on /pay (invoice ${r.invoice_number})` : "Receipt on /pay",
        amount,
        currency: r.currency,
        fx_rate: rate,
        pkr_amount: Math.round(amount * rate * 100) / 100,
        client_id: r.client_id,
        method: "Bank transfer (receipt)",
        receipt_id: r.id,
        notes: r.note,
      }); // before the Finance SQL is run this fails quietly — the receipt is still confirmed
    }
  }

  const { error } = await db
    .from("payment_receipts")
    .update({
      status: "confirmed",
      amount,
      invoice_id: invoice?.id ?? r.invoice_id,
      invoice_number: invoice?.number ?? r.invoice_number,
      payment_id: paymentId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending");
  if (error) return { error: error.message };

  if (isResendConfigured && r.payer_email) {
    await resend.emails
      .send({
        from: fromEmail,
        to: r.payer_email,
        replyTo: toEmail,
        subject: `Payment received${invoice ? ` · ${invoice.number}` : ""} · Ads by Shoaib`,
        html: receiptConfirmedEmail({
          name: r.payer_name || "there",
          amount: formatMoney(amount, r.currency),
          invoice: invoice?.number ?? r.invoice_number,
          invoiceUrl: invoice?.access_token ? invoiceUrl(invoice.access_token) : null,
        }),
      })
      .catch(() => null);
  }

  refresh(invoice?.id ?? r.invoice_id);
  return { ok: true };
}

/** Reject: the money didn't arrive / doesn't match. Tells the payer why. */
export async function rejectReceipt(id: string, reason: string) {
  await assertAuthed();
  const found = await loadPending(id);
  if ("error" in found) return { error: found.error };
  const r = found.receipt;

  const why = String(reason ?? "").trim().slice(0, 500);
  if (why.length < 5) return { error: "Write a short reason for the client." };

  const { error } = await db
    .from("payment_receipts")
    .update({ status: "rejected", reject_reason: why, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending");
  if (error) return { error: error.message };

  if (isResendConfigured && r.payer_email) {
    let retryUrl = `${siteUrl}/pay`;
    if (r.invoice_id) {
      const { data } = await db.from("invoices").select("access_token").eq("id", r.invoice_id).maybeSingle();
      if (data?.access_token) retryUrl = invoiceUrl(data.access_token);
    }
    await resend.emails
      .send({
        from: fromEmail,
        to: r.payer_email,
        replyTo: toEmail,
        subject: "About your payment receipt · Ads by Shoaib",
        html: receiptRejectedEmail({
          name: r.payer_name || "there",
          amount: formatMoney(Number(r.amount), r.currency),
          invoice: r.invoice_number,
          reason: why,
          retryUrl,
        }),
      })
      .catch(() => null);
  }

  refresh(r.invoice_id);
  return { ok: true };
}
