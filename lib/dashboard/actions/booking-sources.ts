"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { db } from "../db";
import { getAdminUser } from "../auth";
import { encryptField } from "../../api-vault-crypto";

/**
 * Connect a business to its hotel website's database (read-only use).
 * The key is checked with one harmless SELECT before it's stored encrypted;
 * it's never sent back to the browser.
 */
export async function saveBookingSource(projectId: string, formData: FormData) {
  if (!(await getAdminUser())) redirect("/dashboard/login");
  const kind = String(formData.get("kind") ?? "");
  const url = String(formData.get("supabase_url") ?? "").trim().replace(/\/$/, "");
  const key = String(formData.get("key") ?? "").trim();
  if (!["silver_sand", "elegant"].includes(kind)) return { error: "Pick the hotel type." };
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)) return { error: "The URL should look like https://xxxx.supabase.co" };
  if (key.length < 40) return { error: "Paste the hotel's service key." };

  const probe = await createClient(url, key, { auth: { persistSession: false } }).from("bookings").select("booking_ref").limit(1);
  if (probe.error) return { error: `Couldn't read bookings with that key: ${probe.error.message}` };

  const { error } = await db
    .from("project_booking_sources")
    .upsert({ project_id: projectId, kind, supabase_url: url, key_enc: encryptField(key), updated_at: new Date().toISOString() });
  if (error) return { error: error.message };
  revalidatePath("/dashboard/bookings");
  return { ok: true };
}

export async function removeBookingSource(projectId: string) {
  if (!(await getAdminUser())) redirect("/dashboard/login");
  await db.from("project_booking_sources").delete().eq("project_id", projectId);
  revalidatePath("/dashboard/bookings");
  return { ok: true };
}
