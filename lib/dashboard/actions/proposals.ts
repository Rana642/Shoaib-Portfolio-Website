"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db";
import { getUser } from "../auth";
import { calculateTotals, round2 } from "../format";
import { generateNumber } from "./documents";
import { resend, isResendConfigured, fromEmail } from "../../resend";
import { proposalSentEmail } from "../../email-templates";
import { siteUrl } from "../../seo";
import { performProposalAcceptance } from "../proposal-acceptance";
import type { Proposal } from "../types";

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

const proposalSchema = z.object({
  client_id: z.string().uuid().optional().nullable(),
  prospect_name: z.string().min(1, "Prospect name is required").max(200),
  prospect_email: z.string().email("A valid email is required").max(320),
  prospect_business: z.string().max(200).optional().nullable(),
  situation: z.string().max(5000).optional().nullable(),
  proposed_solution: z.string().max(5000).optional().nullable(),
  scope_of_work: z.string().max(5000).optional().nullable(),
  currency: z.string().min(1).max(10),
  discount_enabled: z.boolean(),
  discount_type: z.enum(["percentage", "fixed"]),
  discount_value: z.coerce.number().min(0),
  tax_enabled: z.boolean(),
  tax_name: z.string().min(1).max(50),
  tax_rate: z.coerce.number().min(0).max(100),
  terms: z.string().max(5000).optional().nullable(),
  items: z.array(lineItemSchema).min(1, "Add at least one line item"),
});

function parseProposalForm(formData: FormData) {
  let items: unknown;
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { success: false as const, error: "Line items were malformed" };
  }

  const parsed = proposalSchema.safeParse({
    client_id: formData.get("client_id") || null,
    prospect_name: formData.get("prospect_name"),
    prospect_email: formData.get("prospect_email"),
    prospect_business: formData.get("prospect_business") || null,
    situation: formData.get("situation") || null,
    proposed_solution: formData.get("proposed_solution") || null,
    scope_of_work: formData.get("scope_of_work") || null,
    currency: formData.get("currency"),
    discount_enabled: formData.get("discount_enabled") === "on",
    discount_type: formData.get("discount_type") || "percentage",
    discount_value: formData.get("discount_value") || 0,
    tax_enabled: formData.get("tax_enabled") === "on",
    tax_name: formData.get("tax_name") || "GST",
    tax_rate: formData.get("tax_rate") || 0,
    terms: formData.get("terms") || null,
    items,
  });

  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }
  return { success: true as const, data: parsed.data };
}

async function replaceProposalItems(
  proposalId: string,
  items: z.infer<typeof lineItemSchema>[]
): Promise<string | null> {
  const { error: deleteError } = await db
    .from("proposal_items")
    .delete()
    .eq("proposal_id", proposalId);
  if (deleteError) return deleteError.message;

  const rows = items.map((item, index) => ({
    proposal_id: proposalId,
    catalog_item_id: item.catalog_item_id,
    description: item.description,
    quantity: item.quantity,
    rate: item.rate,
    amount: round2(item.quantity * item.rate),
    sort_order: index,
  }));

  const { error: insertError } = await db.from("proposal_items").insert(rows);
  return insertError?.message ?? null;
}

export async function createProposal(formData: FormData) {
  await assertAuthed();

  const parsed = parseProposalForm(formData);
  if (!parsed.success) return { error: parsed.error };
  const { items, ...proposal } = parsed.data;

  const { data: settings } = await db.from("settings").select("*").eq("id", 1).single();
  const number = await generateNumber("proposal", settings?.proposal_prefix ?? "PRO");
  if (!number) return { error: "Couldn't generate a proposal number. Check the database setup." };

  const totals = calculateTotals(items, proposal.tax_enabled, proposal.tax_rate, {
    enabled: proposal.discount_enabled,
    type: proposal.discount_type,
    value: proposal.discount_value,
  });

  const { data: created, error } = await db
    .from("proposals")
    .insert({
      ...proposal,
      number,
      access_token: crypto.randomUUID(),
      subtotal: totals.subtotal,
      discount_amount: totals.discountAmount,
      tax_amount: totals.taxAmount,
      total: totals.total,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const itemsError = await replaceProposalItems(created.id, items);
  if (itemsError) return { error: itemsError };

  revalidatePath("/dashboard/proposals");
  redirect(`/dashboard/proposals/${created.id}`);
}

export async function updateProposal(id: string, formData: FormData) {
  await assertAuthed();

  const parsed = parseProposalForm(formData);
  if (!parsed.success) return { error: parsed.error };
  const { items, ...proposal } = parsed.data;

  const totals = calculateTotals(items, proposal.tax_enabled, proposal.tax_rate, {
    enabled: proposal.discount_enabled,
    type: proposal.discount_type,
    value: proposal.discount_value,
  });

  const { error } = await db
    .from("proposals")
    .update({
      ...proposal,
      subtotal: totals.subtotal,
      discount_amount: totals.discountAmount,
      tax_amount: totals.taxAmount,
      total: totals.total,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  const itemsError = await replaceProposalItems(id, items);
  if (itemsError) return { error: itemsError };

  revalidatePath("/dashboard/proposals");
  redirect(`/dashboard/proposals/${id}`);
}

export async function deleteProposal(id: string) {
  await assertAuthed();

  const { error } = await db.from("proposals").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/proposals");
  redirect("/dashboard/proposals");
}

/** Marks the proposal sent and emails the prospect a link to view/accept
 *  it. Doesn't touch an already-sent proposal's token, so a re-send never
 *  invalidates a link the prospect might already have open. */
export async function sendProposal(id: string) {
  await assertAuthed();

  const { data: proposal } = await db.from("proposals").select("*").eq("id", id).single();
  if (!proposal) return { error: "Proposal not found." };

  const { error } = await db
    .from("proposals")
    .update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  if (isResendConfigured) {
    const url = `${siteUrl}/proposal/${proposal.access_token}`;
    try {
      await resend.emails.send({
        from: fromEmail,
        to: proposal.prospect_email,
        subject: `Proposal from Ads by Shoaib — ${proposal.number}`,
        html: proposalSentEmail({ name: proposal.prospect_name, url }),
      });
    } catch (sendError) {
      console.error("[proposals] Resend send failed:", sendError);
      return { error: "Status updated, but the email failed to send. Check Resend configuration." };
    }
  }

  revalidatePath(`/dashboard/proposals/${id}`);
  revalidatePath("/dashboard/proposals");
  return { ok: true };
}

/** For clients who confirm over a call/WhatsApp instead of the self-serve
 *  link — runs the exact same acceptance cascade (client creation,
 *  agreement generation, agreement email) as the public accept flow. */
export async function markProposalAccepted(id: string) {
  await assertAuthed();

  const { data: proposal } = await db.from("proposals").select("*").eq("id", id).single();
  if (!proposal) return { error: "Proposal not found." };
  if (proposal.status === "accepted") return { error: "This proposal has already been accepted." };
  if (proposal.status === "declined") return { error: "This proposal was already declined." };

  const result = await performProposalAcceptance(
    proposal as Proposal,
    "Confirmed by Shoaib (offline)",
    null
  );
  if ("error" in result) return result;

  revalidatePath(`/dashboard/proposals/${id}`);
  revalidatePath("/dashboard/proposals");
  revalidatePath("/dashboard/agreements");
  return { ok: true };
}
