import "server-only";
import { revalidatePath } from "next/cache";
import { db } from "./dashboard/db";
import { MANUAL_SOURCE_VALUES } from "./booking-source-options";

/**
 * Where a code-less booking came from ("" clears it). NOT a server action —
 * only the authed wrappers (dashboard / portal) call this after their own
 * access checks.
 */
export async function writeOverride(projectId: string, bookingRef: string, source: string, by: string) {
  const ref = bookingRef.trim().toUpperCase().slice(0, 40);
  if (!ref) return { error: "Missing booking." };
  if (!source) {
    await db.from("booking_source_overrides").delete().eq("project_id", projectId).eq("booking_ref", ref);
  } else {
    if (!MANUAL_SOURCE_VALUES.includes(source)) return { error: "Unknown source." };
    const { error } = await db
      .from("booking_source_overrides")
      .upsert({ project_id: projectId, booking_ref: ref, source, set_by: by, updated_at: new Date().toISOString() });
    if (error) return { error: error.message };
  }
  revalidatePath("/dashboard/bookings");
  revalidatePath("/portal/bookings");
  return { ok: true };
}
