"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db";
import { getAdminUser } from "../auth";
import { createRetainerFromProposal, generateRetainerInvoice, firstOfNextMonth, todayPkt } from "../retainers";

async function assertAuthed() {
  const user = await getAdminUser();
  if (!user) redirect("/dashboard/login");
}

/** Proposal page: set up the retainer for an accepted proposal that predates
 *  automatic retainers (or whose auto-setup failed). */
export async function setUpRetainerFromProposal(proposalId: string) {
  await assertAuthed();
  const result = await createRetainerFromProposal(proposalId);
  if (!result) return { error: "This proposal has no monthly lines (or no client yet), so there's nothing to bill monthly." };
  revalidatePath("/dashboard/retainers");
  revalidatePath(`/dashboard/proposals/${proposalId}`);
  redirect(`/dashboard/retainers/${result.id}`);
}

const itemSchema = z.object({
  description: z.string().min(1, "Every line needs a description").max(500),
  quantity: z.coerce.number().min(0),
  rate: z.coerce.number(),
  item_type: z.enum(["service", "tool"]),
  included: z.boolean().default(true),
  catalog_item_id: z.string().uuid().nullable().optional(),
});

const retainerSchema = z.object({
  name: z.string().min(1).max(200),
  status: z.enum(["active", "paused", "ended"]),
  next_invoice_date: z.string().regex(/^\d{4}-\d{2}-01$/, "Next invoice date must be the 1st of a month").nullable(),
  due_days: z.coerce.number().int().min(0).max(90),
  discount_type: z.enum(["percentage", "fixed"]),
  discount_value: z.coerce.number().min(0),
  tax_enabled: z.boolean(),
  tax_name: z.string().min(1).max(50),
  tax_rate: z.coerce.number().min(0).max(100),
  tools_tax_enabled: z.boolean(),
  tools_tax_rate: z.coerce.number().min(0).max(100),
  notes: z.string().max(5000).nullable(),
  items: z.array(itemSchema).min(1, "Add at least one monthly line"),
});

export async function updateRetainer(id: string, formData: FormData) {
  await assertAuthed();
  let items: unknown;
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "Line items were malformed" };
  }
  const parsed = retainerSchema.safeParse({
    name: formData.get("name"),
    status: formData.get("status"),
    next_invoice_date: formData.get("next_invoice_date") || null,
    due_days: formData.get("due_days") || 7,
    discount_type: formData.get("discount_type") || "percentage",
    discount_value: formData.get("discount_value") || 0,
    tax_enabled: formData.get("tax_enabled") === "on",
    tax_name: formData.get("tax_name") || "GST",
    tax_rate: formData.get("tax_rate") || 0,
    tools_tax_enabled: formData.get("tools_tax_enabled") === "on",
    tools_tax_rate: formData.get("tools_tax_rate") || 18,
    notes: formData.get("notes") || null,
    items,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { items: lines, ...fields } = parsed.data;
  const { error } = await db
    .from("retainers")
    .update({
      ...fields,
      end_date: fields.status === "ended" ? todayPkt() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  // Lines are replaced wholesale — invoices already issued are snapshots and
  // never change.
  await db.from("retainer_items").delete().eq("retainer_id", id);
  const { error: itemsError } = await db.from("retainer_items").insert(
    lines.map((l, index) => ({
      retainer_id: id,
      description: l.description,
      quantity: l.quantity,
      rate: l.rate,
      item_type: l.item_type,
      included: l.included,
      catalog_item_id: l.catalog_item_id ?? null,
      sort_order: index,
    }))
  );
  if (itemsError) return { error: itemsError.message };

  revalidatePath("/dashboard/retainers");
  revalidatePath(`/dashboard/retainers/${id}`);
  return { ok: true };
}

/** "Create this month's invoice now" — e.g. to bill a month the cron hasn't
 *  reached yet. Idempotent per month; advances next_invoice_date when it
 *  bills the month that was due. */
export async function createRetainerInvoiceNow(id: string, period: string) {
  await assertAuthed();
  if (!/^\d{4}-\d{2}$/.test(period)) return { error: "Pick a month." };
  const result = await generateRetainerInvoice(id, period);
  if ("error" in result) return { error: result.error };

  const { data: retainer } = await db.from("retainers").select("next_invoice_date").eq("id", id).single();
  if (retainer?.next_invoice_date && retainer.next_invoice_date.slice(0, 7) <= period) {
    await db
      .from("retainers")
      .update({ next_invoice_date: firstOfNextMonth(`${period}-01`), updated_at: new Date().toISOString() })
      .eq("id", id);
  }
  revalidatePath(`/dashboard/retainers/${id}`);
  revalidatePath("/dashboard/invoices");
  redirect(`/dashboard/invoices/${result.id}`);
}
