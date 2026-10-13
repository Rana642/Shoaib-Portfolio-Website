import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/dashboard/db";
import { headObject, isStorageConfigured } from "@/lib/storage";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { checkEmail } from "@/lib/email-check";
import { resend, isResendConfigured, fromEmail, toEmail } from "@/lib/resend";
import { receiptUploadedEmail } from "@/lib/email-templates";
import { siteUrl } from "@/lib/seo";
import { formatMoney, formatDate } from "@/lib/dashboard/format";
import { PAY_CURRENCIES, RECEIPT_MAX_BYTES, RECEIPT_TYPES } from "@/lib/payment-accounts";
import { payableInvoice, receiptPrefix, type PayableInvoice } from "@/lib/payment-receipts";

const schema = z.object({
  token: z.string().max(80).optional().default(""),
  key: z.string().min(10).max(400),
  name: z.string().max(200).optional().default(""),
  amount: z.coerce.number().positive("Enter the amount you sent.").max(100_000_000),
  currency: z.string().max(10).optional().default(""),
  // The form no longer asks for the date — it defaults to today in Pakistan.
  paid_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the payment date.")
    .optional()
    .default(() => new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10)),
  reference: z.string().max(120).optional().default(""),
  note: z.string().max(1000).optional().default(""),
  payer_name: z.string().max(120).optional().default(""),
  payer_email: z.string().max(200).optional().default(""),
  payer_phone: z.string().max(40).optional().default(""),
  invoice_number: z.string().max(40).optional().default(""),
});

/**
 * Public: records a payment receipt the browser just uploaded (see
 * /api/pay/upload-url) and emails Shoaib to review it. Nothing is marked
 * paid here — he confirms it by hand in the dashboard.
 */
export async function POST(request: Request) {
  if (!isStorageConfigured) return NextResponse.json({ error: "Receipt upload isn't available right now." }, { status: 503 });
  if (!(await rateLimit(`payreceipt:${clientIp(request)}`, 8, 3600))) {
    return NextResponse.json({ error: "Too many receipts sent. Please wait a while or send it on WhatsApp." }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const d = parsed.data;

  let invoice: PayableInvoice | null = null;
  if (d.token) {
    const found = await payableInvoice(d.token);
    if ("error" in found) return NextResponse.json({ error: found.error }, { status: found.status });
    invoice = found.invoice;
  } else {
    // /pay asks only for a name and the amount; an email (older form, API) is still checked when given.
    if (!d.payer_name.trim()) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
    const email = d.payer_email.trim();
    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
      const check = await checkEmail(email);
      if (!check.ok) return NextResponse.json({ error: check.message + (check.suggestion ? ` Did you mean ${check.suggestion}?` : "") }, { status: 400 });
    }
    if (!PAY_CURRENCIES.includes(d.currency.toUpperCase())) return NextResponse.json({ error: "Pick the currency you paid in." }, { status: 400 });
  }

  // The key must be one this flow issued for this scope (random UUID inside), and the file must really be there.
  if (!d.key.startsWith(receiptPrefix(d.token || "pay")) || d.key.includes("..")) {
    return NextResponse.json({ error: "Please upload the receipt again." }, { status: 400 });
  }
  const head = await headObject(d.key).catch(() => null);
  if (!head || head.size > RECEIPT_MAX_BYTES || !RECEIPT_TYPES.includes(head.contentType)) {
    return NextResponse.json({ error: "The receipt file didn't upload. Please choose it again." }, { status: 400 });
  }

  const currency = invoice ? invoice.currency : d.currency.toUpperCase();
  const row = {
    source: invoice ? "invoice" : "pay_page",
    invoice_id: invoice?.id ?? null,
    invoice_number: invoice ? invoice.number : d.invoice_number.trim() || null,
    client_id: invoice?.client_id ?? null,
    payer_name: d.payer_name.trim() || invoice?.client?.contact_person || invoice?.client?.name || null,
    payer_email: d.payer_email.trim() || invoice?.client?.email || null,
    payer_phone: d.payer_phone.trim() || null,
    amount: Math.round(d.amount * 100) / 100,
    currency,
    paid_on: d.paid_on,
    reference: d.reference.trim() || null,
    note: d.note.trim() || null,
    file_key: d.key,
    file_name: d.name.slice(0, 200) || null,
    file_type: head.contentType,
    file_size: head.size,
  };
  const { data: saved, error } = await db.from("payment_receipts").insert(row).select("id").single();
  if (error || !saved) {
    if (error?.code === "23505") return NextResponse.json({ ok: true }); // same upload sent twice
    return NextResponse.json({ error: "Couldn't save the receipt. Please try again or send it on WhatsApp." }, { status: 500 });
  }

  if (isResendConfigured) {
    const amount = formatMoney(row.amount, currency);
    await resend.emails
      .send({
        from: fromEmail,
        to: toEmail,
        replyTo: row.payer_email ?? undefined,
        subject: `Payment receipt: ${amount}${row.invoice_number ? ` · ${row.invoice_number}` : ""} · ${row.payer_name ?? "client"}`,
        html: receiptUploadedEmail({
          payer: row.payer_name ?? "A client",
          amount,
          invoice: row.invoice_number,
          paidOn: formatDate(row.paid_on),
          reference: row.reference,
          note: row.note,
          reviewUrl: `${siteUrl}/dashboard/receipts`,
        }),
      })
      .catch(() => null);
  }

  return NextResponse.json({ ok: true });
}
