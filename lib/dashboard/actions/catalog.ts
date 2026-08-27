"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db";
import { getUser } from "../auth";

const catalogSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(2000).optional().nullable(),
  unit: z.string().min(1).max(50),
  default_rate: z.coerce.number().min(0, "Rate can't be negative"),
  currency: z.string().min(1).max(10),
  is_active: z.boolean().optional(),
  sort_order: z.coerce.number().int().optional(),
  is_bundle: z.boolean(),
  member_ids: z.array(z.string().uuid()),
});

async function assertAuthed() {
  const user = await getUser();
  if (!user) redirect("/dashboard/login");
}

function parseForm(formData: FormData) {
  return catalogSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || null,
    unit: formData.get("unit"),
    default_rate: formData.get("default_rate"),
    currency: formData.get("currency"),
    is_active: formData.get("is_active") === "on",
    sort_order: formData.get("sort_order") || 0,
    is_bundle: formData.get("is_bundle") === "on",
    member_ids: formData.getAll("member_ids"),
  });
}

/** Deletes and reinserts which existing services a bundle includes.
 *  Reference/documentation only — a bundle's price is its own field, not
 *  derived from summing members' rates. */
async function replaceBundleMembers(bundleId: string, memberIds: string[]): Promise<string | null> {
  const { error: deleteError } = await db
    .from("catalog_bundle_members")
    .delete()
    .eq("bundle_id", bundleId);
  if (deleteError) return deleteError.message;

  if (memberIds.length === 0) return null;

  const { error: insertError } = await db
    .from("catalog_bundle_members")
    .insert(memberIds.map((member_id) => ({ bundle_id: bundleId, member_id })));
  return insertError?.message ?? null;
}

export async function createCatalogItem(formData: FormData) {
  await assertAuthed();
  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { member_ids, ...item } = parsed.data;

  const { data: created, error } = await db.from("catalog_items").insert(item).select("id").single();
  if (error) return { error: error.message };

  if (item.is_bundle) {
    const membersError = await replaceBundleMembers(created.id, member_ids);
    if (membersError) return { error: membersError };
  }

  revalidatePath("/dashboard/catalog");
  revalidatePath("/dashboard/catalog/bundles");
  redirect(item.is_bundle ? "/dashboard/catalog/bundles" : "/dashboard/catalog");
}

export async function updateCatalogItem(id: string, formData: FormData) {
  await assertAuthed();
  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { member_ids, ...item } = parsed.data;

  const { error } = await db.from("catalog_items").update(item).eq("id", id);
  if (error) return { error: error.message };

  const membersError = await replaceBundleMembers(id, item.is_bundle ? member_ids : []);
  if (membersError) return { error: membersError };

  revalidatePath("/dashboard/catalog");
  revalidatePath("/dashboard/catalog/bundles");
  redirect(item.is_bundle ? "/dashboard/catalog/bundles" : "/dashboard/catalog");
}

export async function deleteCatalogItem(id: string) {
  await assertAuthed();

  // Line items reference this ON DELETE SET NULL, so past documents keep
  // their description/rate even after the catalog entry is removed.
  const { error } = await db.from("catalog_items").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/catalog");
  revalidatePath("/dashboard/catalog/bundles");
  return { ok: true };
}
