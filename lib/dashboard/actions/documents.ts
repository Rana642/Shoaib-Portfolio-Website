"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db";
import { getUser } from "../auth";
import { calculateTotals, round2 } from "../format";

async function assertAuthed() {
  const user = await getUser();
  if (!user) redirect("/dashboard/login");
}

const lineItemSchema = z.object({
  catalog_item_id: z.string().uuid().nullable(),
  description: z.string().min(1, "Every line needs a description").max(500),
  quantity: z.coerce.number().min(0),
  rate: z.coerce.number(),
});

const documentSchema = z.object({
  client_id: z.string().uuid("Pick a client"),
  issue_date: z.string().min(1),
  due_date: z.string().optional().nullable(),
  currency: z.string().min(1).max(10),
  tax_enabled: z.boolean(),
  tax_name: z.string().min(1).max(50),
  tax_rate: z.coerce.number().min(0).max(100),
  notes: z.string().max(5000).optional().nullable(),
  terms: z.string().max(5000).optional().nullable(),
  items: z.array(lineItemSchema).min(1, "Add at least one line item"),
});

type DocumentKind = "quotation" | "invoice";

function parseDocumentForm(formData: FormData) {
  let items: unknown;
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { success: false as const, error: "Line items were malformed" };
  }

  const parsed = documentSchema.safeParse({
    client_id: formData.get("client_id"),
    issue_date: formData.get("issue_date"),
    due_date: formData.get("due_date") || null,
    currency: formData.get("currency"),
    tax_enabled: formData.get("tax_enabled") === "on",
    tax_name: formData.get("tax_name") || "GST",
    tax_rate: formData.get("tax_rate") || 0,
    notes: formData.get("notes") || null,
    terms: formData.get("terms") || null,
    items,
  });

  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }
  return { success: true as const, data: parsed.data };
}

/**
 * Reserves the next number for the year, e.g. INV-2026-001. The counter
 * lives in Postgres so two documents created at once can't collide.
 * Numbers are consumed even if the insert later fails — a gap is far less
 * dangerous on financial records than a duplicate.
 */
export async function generateNumber(kind: string, prefix: string): Promise<string | null> {
  const year = new Date().getFullYear();
  const { data, error } = await db.rpc("next_document_number", {
    p_doc_type: kind,
    p_year: year,
  });
  if (error || data == null) return null;
  return `${prefix}-${year}-${String(data).padStart(3, "0")}`;
}

export async function createDocument(kind: DocumentKind, formData: FormData) {
  await assertAuthed();

  const parsed = parseDocumentForm(formData);
  if (!parsed.success) return { error: parsed.error };
  const { items, ...doc } = parsed.data;

  const { data: settings } = await db.from("settings").select("*").eq("id", 1).single();
  const prefix =
    kind === "invoice" ? (settings?.invoice_prefix ?? "INV") : (settings?.quote_prefix ?? "QUO");

  const number = await generateNumber(kind, prefix);
  if (!number) return { error: "Couldn't generate a document number. Check the database setup." };

  const totals = calculateTotals(items, doc.tax_enabled, doc.tax_rate);
  const table = kind === "invoice" ? "invoices" : "quotations";

  const { data: created, error } = await db
    .from(table)
    .insert({
      ...doc,
      // valid_until and due_date are the same field conceptually, named
      // differently per document type.
      ...(kind === "invoice"
        ? { due_date: doc.due_date }
        : { valid_until: doc.due_date, due_date: undefined }),
      number,
      subtotal: totals.subtotal,
      tax_amount: totals.taxAmount,
      total: totals.total,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const itemsError = await replaceLineItems(kind, created.id, items);
  if (itemsError) return { error: itemsError };

  revalidatePath(`/dashboard/${table}`);
  redirect(`/dashboard/${table}/${created.id}`);
}

export async function updateDocument(kind: DocumentKind, id: string, formData: FormData) {
  await assertAuthed();

  const parsed = parseDocumentForm(formData);
  if (!parsed.success) return { error: parsed.error };
  const { items, ...doc } = parsed.data;

  const totals = calculateTotals(items, doc.tax_enabled, doc.tax_rate);
  const table = kind === "invoice" ? "invoices" : "quotations";

  const { error } = await db
    .from(table)
    .update({
      ...doc,
      ...(kind === "invoice"
        ? { due_date: doc.due_date }
        : { valid_until: doc.due_date, due_date: undefined }),
      subtotal: totals.subtotal,
      tax_amount: totals.taxAmount,
      total: totals.total,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  const itemsError = await replaceLineItems(kind, id, items);
  if (itemsError) return { error: itemsError };

  revalidatePath(`/dashboard/${table}`);
  redirect(`/dashboard/${table}/${id}`);
}

/** Line items are replaced wholesale — simpler and less error-prone than
 *  diffing, and the volume per document is tiny. */
async function replaceLineItems(
  kind: DocumentKind,
  documentId: string,
  items: z.infer<typeof lineItemSchema>[]
): Promise<string | null> {
  const itemsTable = kind === "invoice" ? "invoice_items" : "quotation_items";
  const fk = kind === "invoice" ? "invoice_id" : "quotation_id";

  const { error: deleteError } = await db.from(itemsTable).delete().eq(fk, documentId);
  if (deleteError) return deleteError.message;

  const rows = items.map((item, index) => ({
    [fk]: documentId,
    catalog_item_id: item.catalog_item_id,
    description: item.description,
    quantity: item.quantity,
    rate: item.rate,
    amount: round2(item.quantity * item.rate),
    sort_order: index,
  }));

  const { error: insertError } = await db.from(itemsTable).insert(rows);
  return insertError?.message ?? null;
}

export async function setQuotationStatus(
  id: string,
  status: "draft" | "sent" | "accepted" | "rejected" | "expired"
) {
  await assertAuthed();

  const timestamps: Record<string, string | null> = {};
  if (status === "accepted") timestamps.accepted_at = new Date().toISOString();
  if (status === "rejected") timestamps.rejected_at = new Date().toISOString();

  const { error } = await db
    .from("quotations")
    .update({ status, ...timestamps, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/quotations/${id}`);
  revalidatePath("/dashboard/quotations");
  return { ok: true };
}

export async function setInvoiceStatus(
  id: string,
  status: "draft" | "sent" | "partially_paid" | "paid" | "overdue" | "cancelled"
) {
  await assertAuthed();

  const timestamps: Record<string, string | null> = {};
  if (status === "sent") timestamps.sent_at = new Date().toISOString();
  if (status === "paid") timestamps.paid_at = new Date().toISOString();

  const { error } = await db
    .from("invoices")
    .update({ status, ...timestamps, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/invoices/${id}`);
  revalidatePath("/dashboard/invoices");
  return { ok: true };
}

/**
 * Converts an accepted quotation into a draft invoice, copying the line
 * items and the tax/currency snapshot so the client is billed exactly
 * what they agreed to.
 */
export async function convertQuotationToInvoice(quotationId: string) {
  await assertAuthed();

  const { data: quote } = await db
    .from("quotations")
    .select("*")
    .eq("id", quotationId)
    .single();

  if (!quote) return { error: "Quotation not found" };

  const { data: existing } = await db
    .from("invoices")
    .select("id")
    .eq("quotation_id", quotationId)
    .maybeSingle();

  if (existing) {
    return { error: "This quotation has already been converted into an invoice." };
  }

  const { data: items } = await db
    .from("quotation_items")
    .select("*")
    .eq("quotation_id", quotationId)
    .order("sort_order");

  const { data: settings } = await db.from("settings").select("*").eq("id", 1).single();
  const number = await generateNumber("invoice", settings?.invoice_prefix ?? "INV");
  if (!number) return { error: "Couldn't generate an invoice number." };

  const { data: invoice, error } = await db
    .from("invoices")
    .insert({
      number,
      client_id: quote.client_id,
      quotation_id: quotationId,
      status: "draft",
      issue_date: new Date().toISOString().slice(0, 10),
      currency: quote.currency,
      tax_enabled: quote.tax_enabled,
      tax_name: quote.tax_name,
      tax_rate: quote.tax_rate,
      subtotal: quote.subtotal,
      tax_amount: quote.tax_amount,
      total: quote.total,
      notes: quote.notes,
      terms: settings?.payment_terms ?? quote.terms,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (items && items.length > 0) {
    await db.from("invoice_items").insert(
      items.map((item, index) => ({
        invoice_id: invoice.id,
        catalog_item_id: item.catalog_item_id,
        description: item.description,
        quantity: item.quantity,
        rate: item.rate,
        amount: item.amount,
        sort_order: index,
      }))
    );
  }

  revalidatePath("/dashboard/invoices");
  revalidatePath(`/dashboard/quotations/${quotationId}`);
  redirect(`/dashboard/invoices/${invoice.id}`);
}

export async function deleteDocument(kind: DocumentKind, id: string) {
  await assertAuthed();
  const table = kind === "invoice" ? "invoices" : "quotations";

  const { error } = await db.from(table).delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/${table}`);
  redirect(`/dashboard/${table}`);
}

const paymentSchema = z.object({
  amount: z.coerce.number().positive("Amount must be more than zero"),
  paid_at: z.string().min(1),
  method: z.string().max(100).optional().nullable(),
  reference: z.string().max(200).optional().nullable(),
});

export async function recordPayment(invoiceId: string, formData: FormData) {
  await assertAuthed();

  const parsed = paymentSchema.safeParse({
    amount: formData.get("amount"),
    paid_at: formData.get("paid_at"),
    method: formData.get("method") || null,
    reference: formData.get("reference") || null,
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error: paymentError } = await db
    .from("payments")
    .insert({ invoice_id: invoiceId, ...parsed.data });
  if (paymentError) return { error: paymentError.message };

  // Recompute from the payments table rather than incrementing, so a
  // deleted or corrected payment can't leave the invoice out of sync.
  const { data: payments } = await db
    .from("payments")
    .select("amount")
    .eq("invoice_id", invoiceId);

  const amountPaid = round2(
    (payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0)
  );

  const { data: invoice } = await db
    .from("invoices")
    .select("total, status")
    .eq("id", invoiceId)
    .single();

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

  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  revalidatePath("/dashboard/invoices");
  return { ok: true };
}
