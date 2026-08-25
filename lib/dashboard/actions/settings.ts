"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db";
import { getUser } from "../auth";

const settingsSchema = z.object({
  business_name: z.string().min(1).max(200),
  business_email: z.string().max(320).optional().nullable(),
  business_phone: z.string().max(50).optional().nullable(),
  business_address: z.string().max(500).optional().nullable(),
  default_currency: z.string().min(1).max(10),
  tax_enabled: z.boolean(),
  tax_name: z.string().min(1).max(50),
  tax_rate: z.coerce.number().min(0).max(100),
  invoice_prefix: z.string().min(1).max(10),
  quote_prefix: z.string().min(1).max(10),
  proposal_prefix: z.string().min(1).max(10),
  agreement_prefix: z.string().min(1).max(10),
  payment_terms: z.string().max(2000).optional().nullable(),
  bank_details: z.string().max(2000).optional().nullable(),
});

export async function updateSettings(formData: FormData) {
  const user = await getUser();
  if (!user) redirect("/dashboard/login");

  const parsed = settingsSchema.safeParse({
    business_name: formData.get("business_name"),
    business_email: formData.get("business_email") || null,
    business_phone: formData.get("business_phone") || null,
    business_address: formData.get("business_address") || null,
    default_currency: formData.get("default_currency"),
    tax_enabled: formData.get("tax_enabled") === "on",
    tax_name: formData.get("tax_name") || "GST",
    tax_rate: formData.get("tax_rate") || 0,
    invoice_prefix: formData.get("invoice_prefix"),
    quote_prefix: formData.get("quote_prefix"),
    proposal_prefix: formData.get("proposal_prefix"),
    agreement_prefix: formData.get("agreement_prefix"),
    payment_terms: formData.get("payment_terms") || null,
    bank_details: formData.get("bank_details") || null,
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // These are defaults for NEW documents only — existing quotations and
  // invoices keep the tax/currency snapshot taken when they were created.
  const { error } = await db
    .from("settings")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", 1);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/settings");
  return { ok: true };
}
