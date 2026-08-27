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
  discounted_rate: z.coerce.number().min(0, "Rate can't be negative").optional().nullable(),
  currency: z.string().min(1).max(10),
  is_active: z.boolean().optional(),
  sort_order: z.coerce.number().int().optional(),
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
    discounted_rate: formData.get("discounted_rate") || null,
    currency: formData.get("currency"),
    is_active: formData.get("is_active") === "on",
    sort_order: formData.get("sort_order") || 0,
  });
}

export async function createCatalogItem(formData: FormData) {
  await assertAuthed();
  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await db.from("catalog_items").insert(parsed.data);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/catalog");
  redirect("/dashboard/catalog");
}

export async function updateCatalogItem(id: string, formData: FormData) {
  await assertAuthed();
  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await db.from("catalog_items").update(parsed.data).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/catalog");
  redirect("/dashboard/catalog");
}

export async function deleteCatalogItem(id: string) {
  await assertAuthed();

  // Line items reference this ON DELETE SET NULL, so past documents keep
  // their description/rate even after the catalog entry is removed.
  const { error } = await db.from("catalog_items").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/catalog");
  return { ok: true };
}
