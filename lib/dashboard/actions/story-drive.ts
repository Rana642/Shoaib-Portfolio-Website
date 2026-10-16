"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminUser } from "../auth";
import { db } from "../db";
import { parseDriveFolderId, rebalanceDriveStories, syncStoryFolder } from "../../story-drive";

async function assertAuthed() {
  const user = await getAdminUser();
  if (!user) redirect("/dashboard/login");
}

const back = (projectId: string, extra = "") => `/dashboard/social/stories?project=${projectId}${extra}`;

/** Saves the project's Drive folder (and stories per day), then syncs once. */
export async function saveStoryDriveFolder(formData: FormData) {
  await assertAuthed();
  const projectId = String(formData.get("project_id") ?? "");
  const url = String(formData.get("folder_url") ?? "").trim();
  const perDay = Math.min(20, Math.max(1, Number(formData.get("per_day") ?? 8) || 8));
  const folderId = parseDriveFolderId(url);
  if (!folderId) redirect(back(projectId, `&drive_error=${encodeURIComponent("That doesn't look like a Google Drive folder link.")}`));
  const { error } = await db
    .from("story_drive_sources")
    // A new folder or a new per-day count re-picks the active hours.
    .upsert({ project_id: projectId, folder_id: folderId, folder_url: url, per_day: perDay, slot_hours: null, slots_updated_at: null }, { onConflict: "project_id" });
  if (error) redirect(back(projectId, `&drive_error=${encodeURIComponent(error.message)}`));
  // A changed per-day count re-spreads what's already on the calendar.
  await rebalanceDriveStories(projectId);
  await syncStoryFolder(projectId, 8);
  revalidatePath("/dashboard/social/stories");
  redirect(back(projectId, "&drive=saved"));
}

export async function syncStoryDriveNow(formData: FormData) {
  await assertAuthed();
  const projectId = String(formData.get("project_id") ?? "");
  await syncStoryFolder(projectId, 8);
  revalidatePath("/dashboard/social/stories");
  redirect(back(projectId, "&drive=synced"));
}

/** Stops importing (stories already on the calendar stay). */
export async function removeStoryDriveFolder(formData: FormData) {
  await assertAuthed();
  const projectId = String(formData.get("project_id") ?? "");
  await db.from("story_drive_sources").delete().eq("project_id", projectId);
  revalidatePath("/dashboard/social/stories");
  redirect(back(projectId, "&drive=removed"));
}
