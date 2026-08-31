"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db";
import { getUser } from "../auth";
import type { ClientIntake, IntakeAsset } from "../types";

async function assertAuthed() {
  const user = await getUser();
  if (!user) redirect("/dashboard/login");
}

/** Creates an intake request for a client (or a typed business name) and
 *  opens it so Shoaib can grab the share link. Authed. */
export async function createIntake(formData: FormData) {
  await assertAuthed();

  const businessName = String(formData.get("business_name") ?? "").trim();
  if (!businessName) return { error: "A business name is required." };
  const clientIdRaw = String(formData.get("client_id") ?? "").trim();
  const clientId = clientIdRaw || null;

  const { data, error } = await db
    .from("client_intakes")
    .insert({
      business_name: businessName,
      client_id: clientId,
      access_token: crypto.randomUUID(),
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/dashboard/intakes");
  redirect(`/dashboard/intakes/${data.id}`);
}

export async function deleteIntake(id: string) {
  await assertAuthed();
  const { error } = await db.from("client_intakes").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/intakes");
  redirect("/dashboard/intakes");
}

/** Public — validated by access_token alone, same pattern as the other
 *  token-gated public actions. */
export async function getIntakeByToken(token: string): Promise<ClientIntake | null> {
  const { data } = await db
    .from("client_intakes")
    .select("*")
    .eq("access_token", token)
    .maybeSingle();
  return (data as ClientIntake) ?? null;
}

const assetSchema = z.object({
  key: z.string().max(512),
  name: z.string().max(300),
  size: z.number().nonnegative(),
  type: z.string().max(150),
});

const submitSchema = z.object({
  contact_name: z.string().max(200).optional().nullable(),
  contact_emails: z.string().max(1000).optional().nullable(),
  contact_phone: z.string().max(200).optional().nullable(),
  address: z.string().max(1000).optional().nullable(),
  website: z.string().max(500).optional().nullable(),
  social_handles: z.string().max(2000).optional().nullable(),
  competitors: z.string().max(3000).optional().nullable(),
  target_audience: z.string().max(3000).optional().nullable(),
  brand_notes: z.string().max(3000).optional().nullable(),
  account_access_notes: z.string().max(3000).optional().nullable(),
  brand_asset_links: z.string().max(2000).optional().nullable(),
  additional_notes: z.string().max(5000).optional().nullable(),
  assets: z.array(assetSchema).max(50),
});

/** Public — the client submitting their own intake. `assets` arrives as a
 *  JSON string of files already uploaded to storage via presigned URLs. */
export async function submitIntake(token: string, formData: FormData) {
  const { data: intake } = await db
    .from("client_intakes")
    .select("id, status")
    .eq("access_token", token)
    .maybeSingle();

  if (!intake) return { error: "This intake link isn't valid." };
  if (intake.status === "submitted") return { error: "This form has already been submitted." };

  let assets: IntakeAsset[] = [];
  try {
    const raw = formData.get("assets");
    if (typeof raw === "string" && raw) assets = JSON.parse(raw);
  } catch {
    return { error: "Couldn't read the uploaded files. Please try again." };
  }

  const parsed = submitSchema.safeParse({
    contact_name: formData.get("contact_name") || null,
    contact_emails: formData.get("contact_emails") || null,
    contact_phone: formData.get("contact_phone") || null,
    address: formData.get("address") || null,
    website: formData.get("website") || null,
    social_handles: formData.get("social_handles") || null,
    competitors: formData.get("competitors") || null,
    target_audience: formData.get("target_audience") || null,
    brand_notes: formData.get("brand_notes") || null,
    account_access_notes: formData.get("account_access_notes") || null,
    brand_asset_links: formData.get("brand_asset_links") || null,
    additional_notes: formData.get("additional_notes") || null,
    assets,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await db
    .from("client_intakes")
    .update({ ...parsed.data, status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", intake.id);
  if (error) return { error: error.message };

  return { ok: true };
}
