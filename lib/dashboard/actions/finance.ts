"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db";
import { getAdminUser } from "../auth";
import { deleteObject, headObject } from "../../storage";
import { pkrRate } from "../../fx-rate";
import {
  BILL_FREQUENCIES,
  FINANCE_CURRENCIES,
  RECEIPT_MAX_BYTES,
  RECEIPT_TYPES,
  isCategory,
  isPassThroughCategory,
  nextDue,
  round2,
  type BillFrequency,
} from "../../finance";

async function assertAuthed() {
  const user = await getAdminUser();
  if (!user) redirect("/dashboard/login");
}

const SQL_HINT = "The Finance tables aren't set up yet — run the Finance SQL block in supabase/dashboard-schema.sql once.";
const missingTable = (e: { code?: string; message?: string }) =>
  e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? "");

function revalidateFinance() {
  for (const p of ["/dashboard/finance", "/dashboard/finance/expenses", "/dashboard/finance/income", "/dashboard/finance/reports"]) {
    revalidatePath(p);
  }
}

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() ? v.trim() : null));

const fileSchema = z.object({
  key: z.string().min(10).max(400),
  name: z.string().max(200),
});

const entrySchema = z.object({
  id: z.string().uuid().optional().nullable(),
  kind: z.enum(["expense", "income"]),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date."),
  category: z.string().min(1, "Pick a category."),
  party: optionalText(160),
  description: optionalText(300),
  amount: z.coerce.number().positive("Enter the amount.").max(1_000_000_000),
  currency: z.enum(FINANCE_CURRENCIES),
  /** Blank = work it out from the rate on the day. */
  pkr_amount: z.coerce.number().positive().max(100_000_000_000).optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  pass_through: z.boolean().optional().default(false),
  method: optionalText(60),
  bill_id: z.string().uuid().optional().nullable(),
  notes: optionalText(1000),
  file: fileSchema.optional().nullable(),
  remove_file: z.boolean().optional().default(false),
});

export type EntryInput = z.input<typeof entrySchema>;

/** Adds or edits a line of money in / out. Paying a monthly bill moves that bill to its next due date. */
export async function saveEntry(input: EntryInput) {
  await assertAuthed();
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (!isCategory(d.kind, d.category)) return { error: "Pick a category from the list." };

  let pkr = d.pkr_amount ?? null;
  let fxRate: number;
  if (d.currency === "PKR") {
    pkr = d.amount;
    fxRate = 1;
  } else if (pkr) {
    fxRate = Math.round((pkr / d.amount) * 10000) / 10000;
  } else {
    const rate = await pkrRate(d.currency, d.entry_date);
    if (!rate) return { error: `Couldn't find the ${d.currency} rate for that day — enter the PKR amount yourself.` };
    fxRate = rate;
    pkr = round2(d.amount * rate);
  }

  let fileFields: Record<string, unknown> = {};
  if (d.file) {
    if (!d.file.key.startsWith("finance/") || d.file.key.includes("..")) return { error: "Please attach the receipt again." };
    const head = await headObject(d.file.key).catch(() => null);
    if (!head || head.size > RECEIPT_MAX_BYTES || !RECEIPT_TYPES.includes(head.contentType)) {
      return { error: "The receipt didn't upload. Please attach it again." };
    }
    fileFields = { file_key: d.file.key, file_name: d.file.name || null, file_type: head.contentType, file_size: head.size };
  } else if (d.remove_file) {
    fileFields = { file_key: null, file_name: null, file_type: null, file_size: null };
  }

  const row = {
    kind: d.kind,
    entry_date: d.entry_date,
    category: d.category,
    party: d.party,
    description: d.description,
    amount: round2(d.amount),
    currency: d.currency,
    fx_rate: fxRate,
    pkr_amount: round2(pkr!),
    client_id: d.client_id || null,
    pass_through: isPassThroughCategory(d.kind, d.category) || d.pass_through,
    method: d.method,
    notes: d.notes,
    ...fileFields,
  };

  if (d.id) {
    const { data: old } = await db.from("finance_entries").select("file_key").eq("id", d.id).maybeSingle();
    if (!old) return { error: "That entry doesn't exist any more." };
    const { error } = await db.from("finance_entries").update({ ...row, updated_at: new Date().toISOString() }).eq("id", d.id);
    if (error) return { error: error.message };
    // A replaced or removed receipt leaves no orphan file behind.
    if (old.file_key && (d.file || d.remove_file) && old.file_key !== d.file?.key) await deleteObject(old.file_key).catch(() => null);
  } else {
    const { error } = await db.from("finance_entries").insert({ ...row, bill_id: d.bill_id || null });
    if (error) return { error: missingTable(error) ? SQL_HINT : error.message };
    if (d.bill_id) {
      const { data: bill } = await db.from("finance_bills").select("next_due, frequency").eq("id", d.bill_id).maybeSingle();
      if (bill) {
        await db
          .from("finance_bills")
          .update({ next_due: nextDue(bill.next_due as string, bill.frequency as BillFrequency), updated_at: new Date().toISOString() })
          .eq("id", d.bill_id);
      }
    }
  }

  revalidateFinance();
  return { ok: true as const };
}

export async function deleteEntry(id: string) {
  await assertAuthed();
  const { data } = await db.from("finance_entries").select("file_key").eq("id", id).maybeSingle();
  const { error } = await db.from("finance_entries").delete().eq("id", id);
  if (error) return { error: error.message };
  if (data?.file_key) await deleteObject(data.file_key as string).catch(() => null);
  revalidateFinance();
  return { ok: true as const };
}

const billSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1, "Give the bill a name.").max(120),
  vendor: optionalText(120),
  category: z.string().min(1),
  amount: z.coerce.number().min(0).max(1_000_000_000),
  currency: z.enum(FINANCE_CURRENCIES),
  frequency: z.enum(BILL_FREQUENCIES.map((f) => f.key) as [BillFrequency, ...BillFrequency[]]),
  next_due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the next due date."),
  client_id: z.string().uuid().optional().nullable(),
  method: optionalText(60),
  is_active: z.boolean().optional().default(true),
  notes: optionalText(500),
});

export type BillInput = z.input<typeof billSchema>;

export async function saveBill(input: BillInput) {
  await assertAuthed();
  const parsed = billSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...b } = parsed.data;
  if (!isCategory("expense", b.category)) return { error: "Pick a category from the list." };
  const row = { ...b, amount: round2(b.amount), client_id: b.client_id || null, updated_at: new Date().toISOString() };
  const { error } = id ? await db.from("finance_bills").update(row).eq("id", id) : await db.from("finance_bills").insert(row);
  if (error) return { error: missingTable(error) ? SQL_HINT : error.message };
  revalidateFinance();
  return { ok: true as const };
}

export async function deleteBill(id: string) {
  await assertAuthed();
  const { error } = await db.from("finance_bills").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidateFinance();
  return { ok: true as const };
}

/** Pause / resume a monthly bill without deleting it. */
export async function setBillActive(id: string, active: boolean) {
  await assertAuthed();
  const { error } = await db.from("finance_bills").update({ is_active: active, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  revalidateFinance();
  return { ok: true as const };
}

/** The PKR that actually reached the bank for an invoice paid in another currency. */
export async function setPaymentPkr(paymentId: string, pkrAmount: number) {
  await assertAuthed();
  const pkr = round2(Number(pkrAmount));
  if (!(pkr > 0)) return { error: "Enter the PKR amount you received." };
  const { data: p } = await db.from("payments").select("amount").eq("id", paymentId).maybeSingle();
  if (!p) return { error: "That payment doesn't exist any more." };
  const { error } = await db
    .from("payments")
    .update({ pkr_amount: pkr, fx_rate: Math.round((pkr / Number(p.amount)) * 10000) / 10000 })
    .eq("id", paymentId);
  if (error) return { error: missingTable(error) || error.code === "42703" ? SQL_HINT : error.message };
  revalidateFinance();
  return { ok: true as const };
}
