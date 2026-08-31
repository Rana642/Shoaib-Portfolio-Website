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

/** Lock (or unlock) an intake. Once locked, the client can no longer edit
 *  their submission from the public link — Shoaib closes it when the info
 *  is final. */
export async function setIntakeLocked(id: string, locked: boolean) {
  await assertAuthed();
  const { error } = await db.from("client_intakes").update({ locked }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/intakes/${id}`);
  return { ok: true };
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
  kind: z.enum(["logo", "media"]).optional(),
});

const submitSchema = z.object({
  contact_name: z.string().max(200).optional().nullable(),
  contact_role: z.string().max(200).optional().nullable(),
  contact_emails: z.string().max(1000).optional().nullable(),
  contact_phone: z.string().max(200).optional().nullable(),
  whatsapp: z.string().max(200).optional().nullable(),
  registered_name: z.string().max(300).optional().nullable(),
  address: z.string().max(1000).optional().nullable(),
  website: z.string().max(500).optional().nullable(),
  operating_days: z.string().max(200).optional().nullable(),
  hours_open: z.string().max(50).optional().nullable(),
  hours_close: z.string().max(50).optional().nullable(),
  service_areas: z.string().max(2000).optional().nullable(),
  landmark: z.string().max(2000).optional().nullable(),
  brand_colors: z.string().max(500).optional().nullable(),
  target_audience: z.string().max(3000).optional().nullable(),
  brand_notes: z.string().max(3000).optional().nullable(),
  social_handles: z.string().max(2000).optional().nullable(),
  competitors: z.string().max(3000).optional().nullable(),
  platforms: z.string().max(500).optional().nullable(),
  master_email: z.string().max(320).optional().nullable(),
  brand_asset_links: z.string().max(2000).optional().nullable(),
  additional_notes: z.string().max(5000).optional().nullable(),
  assets: z.array(assetSchema).max(50),
});

/** Public — the client submitting their own intake. `assets` arrives as a
 *  JSON string of files already uploaded to storage via presigned URLs. */
export async function submitIntake(token: string, formData: FormData) {
  const { data: intake } = await db
    .from("client_intakes")
    .select("id, locked")
    .eq("access_token", token)
    .maybeSingle();

  if (!intake) return { error: "This intake link isn't valid." };
  // Re-submitting is allowed (the client can keep editing) until Shoaib
  // locks the form from the dashboard.
  if (intake.locked) return { error: "This form is closed for edits — please get in touch to update anything." };

  let assets: IntakeAsset[] = [];
  try {
    const raw = formData.get("assets");
    if (typeof raw === "string" && raw) assets = JSON.parse(raw);
  } catch {
    return { error: "Couldn't read the uploaded files. Please try again." };
  }

  const parsed = submitSchema.safeParse({
    contact_name: formData.get("contact_name") || null,
    contact_role: formData.get("contact_role") || null,
    contact_emails: formData.get("contact_emails") || null,
    contact_phone: formData.get("contact_phone") || null,
    whatsapp: formData.get("whatsapp") || null,
    registered_name: formData.get("registered_name") || null,
    address: formData.get("address") || null,
    website: formData.get("website") || null,
    operating_days: formData.get("operating_days") || null,
    hours_open: formData.get("hours_open") || null,
    hours_close: formData.get("hours_close") || null,
    service_areas: formData.get("service_areas") || null,
    landmark: formData.get("landmark") || null,
    brand_colors: formData.get("brand_colors") || null,
    target_audience: formData.get("target_audience") || null,
    brand_notes: formData.get("brand_notes") || null,
    social_handles: formData.get("social_handles") || null,
    competitors: formData.get("competitors") || null,
    platforms: formData.get("platforms") || null,
    master_email: formData.get("master_email") || null,
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
