"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUser } from "../auth";
import {
  connectFacebookAccount,
  rediscoverFacebookPages,
  saveFacebookPageMappings,
  connectLinkedInAccount,
  rediscoverLinkedInOrganizations,
  saveLinkedInOrgMappings,
  addManualSocialAccount,
  removeSocialAccount,
} from "../../social-accounts";
import {
  createScheduledPost,
  deleteScheduledPost,
  dateToScheduledAt,
  rescheduleScheduledPost,
} from "../../scheduled-posts";
import type { DiscoveredPage } from "../../social-fb";
import type { DiscoveredOrganization } from "../../social-linkedin";

async function assertAuthed() {
  const user = await getUser();
  if (!user) redirect("/dashboard/login");
}

export async function connectFacebook(formData: FormData) {
  await assertAuthed();
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { error: "Paste a User Access Token first." };
  try {
    const pages = await connectFacebookAccount(token);
    return { ok: true, pages };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't connect to Facebook." };
  }
}

export async function refreshFacebookPages() {
  await assertAuthed();
  try {
    const pages = await rediscoverFacebookPages();
    return { ok: true, pages };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't refresh pages." };
  }
}

const mappingSchema = z.array(z.object({ project_id: z.string().uuid(), page: z.custom<DiscoveredPage>() }));

export async function saveMappings(mappingsJson: string) {
  await assertAuthed();
  let mappings;
  try {
    mappings = mappingSchema.parse(JSON.parse(mappingsJson));
  } catch {
    return { error: "Invalid mapping data." };
  }
  try {
    await saveFacebookPageMappings(mappings);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't save the mapping." };
  }
  revalidatePath("/dashboard/social");
  return { ok: true };
}

export async function connectLinkedIn(formData: FormData) {
  await assertAuthed();
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { error: "Paste a member access token first." };
  try {
    const orgs = await connectLinkedInAccount(token);
    return { ok: true, orgs };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't connect to LinkedIn." };
  }
}

export async function refreshLinkedInOrgs() {
  await assertAuthed();
  try {
    const orgs = await rediscoverLinkedInOrganizations();
    return { ok: true, orgs };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't refresh Pages." };
  }
}

const linkedinMappingSchema = z.array(
  z.object({ project_id: z.string().uuid(), org: z.custom<DiscoveredOrganization>() })
);

export async function saveLinkedInMappings(mappingsJson: string) {
  await assertAuthed();
  let mappings;
  try {
    mappings = linkedinMappingSchema.parse(JSON.parse(mappingsJson));
  } catch {
    return { error: "Invalid mapping data." };
  }
  try {
    await saveLinkedInOrgMappings(mappings);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't save the mapping." };
  }
  revalidatePath("/dashboard/social");
  return { ok: true };
}

const manualAccountSchema = z.object({
  project_id: z.string().uuid(),
  platform: z.enum(["facebook", "instagram", "linkedin"]),
  label: z.string().min(1).max(200),
  external_id: z.string().min(1).max(200),
  access_token: z.string().min(1),
});

export async function addManualAccount(formData: FormData) {
  await assertAuthed();
  const parsed = manualAccountSchema.safeParse({
    project_id: formData.get("project_id"),
    platform: formData.get("platform"),
    label: formData.get("label"),
    external_id: formData.get("external_id"),
    access_token: formData.get("access_token"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await addManualSocialAccount(parsed.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't save the account." };
  }
  revalidatePath("/dashboard/social");
  return { ok: true };
}

export async function removeAccount(id: string) {
  await assertAuthed();
  await removeSocialAccount(id);
  revalidatePath("/dashboard/social");
}

const plannerUploadSchema = z.object({
  project_id: z.string().uuid(),
  media_key: z.string().min(1),
  original_filename: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  offset_minutes: z.coerce.number().int().min(0).max(1000).default(0),
  caption: z.string().max(2200).optional(),
});

/** Creates one planner post for the day the user clicked on the calendar —
 *  offset_minutes lets a batch of same-day uploads not collide on the exact
 *  same scheduled_at. */
export async function createPlannerPost(formData: FormData) {
  await assertAuthed();
  const parsed = plannerUploadSchema.safeParse({
    project_id: formData.get("project_id"),
    media_key: formData.get("media_key"),
    original_filename: formData.get("original_filename"),
    date: formData.get("date"),
    offset_minutes: formData.get("offset_minutes") ?? 0,
    caption: formData.get("caption") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await createScheduledPost({
      project_id: parsed.data.project_id,
      media_key: parsed.data.media_key,
      original_filename: parsed.data.original_filename,
      scheduled_at: dateToScheduledAt(parsed.data.date, parsed.data.offset_minutes),
      caption: parsed.data.caption,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't queue the upload." };
  }
  revalidatePath("/dashboard/social/planner");
  return { ok: true };
}

export async function deletePost(id: string) {
  await assertAuthed();
  await deleteScheduledPost(id);
  revalidatePath("/dashboard/social/planner");
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

/** Drag-and-drop (or a bulk auto-fill correction) moving a post to a
 *  different day. */
export async function movePost(id: string, date: string) {
  await assertAuthed();
  const parsed = dateSchema.safeParse(date);
  if (!parsed.success) return { error: "Invalid date." };
  await rescheduleScheduledPost(id, parsed.data);
  revalidatePath("/dashboard/social/planner");
}
