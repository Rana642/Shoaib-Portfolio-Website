"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db";
import { getAdminUser } from "../auth";
import type { ClientIntake, IntakeAsset } from "../types";

async function assertAuthed() {
  const user = await getAdminUser();
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

// The one-page setup form (2026-09-26). Only these columns are written, so
// answers an intake already has from the older multi-step form (hours,
// service areas, colours, platforms…) are never wiped by an edit.
const text = (max: number) => z.string().trim().max(max).nullable();
const submitSchema = z.object({
  registered_name: text(300),
  contact_phone: text(200),
  contact_emails: text(1000),
  address: text(1000),
  website: text(500),
  business_overview: text(5000),
  target_audience: text(3000),
  usp: text(3000),
  brand_asset_links: text(2000),
  competitors: text(3000),
  design_references: text(3000),
  assets: z.array(assetSchema).max(50),
});
const TEXT_FIELDS = [
  "registered_name",
  "contact_phone",
  "contact_emails",
  "address",
  "website",
  "business_overview",
  "target_audience",
  "usp",
  "brand_asset_links",
  "competitors",
  "design_references",
] as const;

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

  const fields = Object.fromEntries(
    TEXT_FIELDS.map((key) => [key, String(formData.get(key) ?? "").trim() || null])
  );
  const parsed = submitSchema.safeParse({ ...fields, assets });
  if (!parsed.success) return { error: "One of the answers is too long — please shorten it and try again." };

  const { error } = await db
    .from("client_intakes")
    .update({ ...parsed.data, status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", intake.id);
  if (error) {
    console.error("[intake] submit failed:", error);
    return { error: "Couldn't save your answers just now — please try again in a few minutes." };
  }

  return { ok: true };
}
