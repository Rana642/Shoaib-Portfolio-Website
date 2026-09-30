"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminUser } from "../auth";
import { db } from "../db";
import { deleteReviewReply, existingGrants, findLocation, gbpAccessToken, getGbpConnection, linkFromGrant, matchLocation, replyToReview, type GbpLocation } from "../../gbp";

async function assertAuthed() {
  const user = await getAdminUser();
  if (!user) redirect("/dashboard/login");
}

const back = (projectId: string, extra = "") => `/dashboard/gbp?project=${projectId}${extra}`;

export async function selectGbpLocation(formData: FormData) {
  await assertAuthed();
  const projectId = String(formData.get("project_id") ?? "");
  const location = String(formData.get("location") ?? "");
  const conn = await getGbpConnection(projectId);
  if (!conn || !conn.locations.some((l) => l.name === location)) redirect(back(projectId, "&error=location"));
  await db.from("gbp_connections").update({ selected_location: location }).eq("project_id", projectId);
  revalidatePath("/dashboard/gbp");
  redirect(back(projectId));
}

async function withLocation(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const conn = await getGbpConnection(projectId);
  const loc = conn ? findLocation(conn) : null;
  return { projectId, loc };
}

export async function replyGbpReview(formData: FormData) {
  await assertAuthed();
  const { projectId, loc } = await withLocation(formData);
  const filter = formData.get("filter") === "unreplied" ? "&filter=unreplied" : "";
  if (!loc) redirect(back(projectId, "&error=location"));
  let message = `${filter}&replied=1`;
  try {
    await replyToReview(await gbpAccessToken(projectId), loc, String(formData.get("review_id") ?? ""), String(formData.get("comment") ?? ""));
  } catch (error) {
    message = `${filter}&error=${encodeURIComponent(error instanceof Error ? error.message : "reply")}`;
  }
  revalidatePath("/dashboard/gbp");
  redirect(back(projectId, message));
}

export async function deleteGbpReply(formData: FormData) {
  await assertAuthed();
  const { projectId, loc } = await withLocation(formData);
  if (!loc) redirect(back(projectId, "&error=location"));
  let message = "&reply_deleted=1";
  try {
    await deleteReviewReply(await gbpAccessToken(projectId), loc, String(formData.get("review_id") ?? ""));
  } catch (error) {
    message = `&error=${encodeURIComponent(error instanceof Error ? error.message : "delete")}`;
  }
  revalidatePath("/dashboard/gbp");
  redirect(back(projectId, message));
}

/** Edit a waiting reply in the queue (only while it hasn't been sent). */
export async function updateQueuedReply(formData: FormData) {
  await assertAuthed();
  const projectId = String(formData.get("project_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const reply = String(formData.get("reply") ?? "").trim();
  if (!reply || reply.length > 4096) redirect(back(projectId, "&error=A%20reply%20needs%201%E2%80%934096%20characters."));
  await db.from("gbp_reply_queue").update({ reply, status: "approved", attempts: 0, last_error: null }).eq("id", id).eq("project_id", projectId).neq("status", "sent");
  revalidatePath("/dashboard/gbp");
  redirect(back(projectId, "&queue_saved=1"));
}

/** Take a reply out of the queue without sending it. */
export async function skipQueuedReply(formData: FormData) {
  await assertAuthed();
  const projectId = String(formData.get("project_id") ?? "");
  const id = String(formData.get("id") ?? "");
  await db.from("gbp_reply_queue").update({ status: "skipped", last_error: "Skipped from the dashboard." }).eq("id", id).eq("project_id", projectId).neq("status", "sent");
  revalidatePath("/dashboard/gbp");
  redirect(back(projectId, "&queue_saved=1"));
}

export async function disconnectGbp(formData: FormData) {
  await assertAuthed();
  const projectId = String(formData.get("project_id") ?? "");
  await db.from("gbp_connections").delete().eq("project_id", projectId);
  revalidatePath("/dashboard/gbp");
  redirect(back(projectId, "&disconnected=1"));
}

async function projectName(projectId: string): Promise<string | null> {
  const { data } = await db.from("client_projects").select("name").eq("id", projectId).maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

/** Connect a project with a Google account that's already connected on
 *  another project — no second Google sign-in. */
export async function linkGbpFromExisting(formData: FormData) {
  await assertAuthed();
  const projectId = String(formData.get("project_id") ?? "");
  const sourceProjectId = String(formData.get("source_project_id") ?? "");
  const name = await projectName(projectId);
  if (!name) redirect("/dashboard/gbp?error=project");
  let message = "&connected=1";
  try {
    const loc = await linkFromGrant(projectId, sourceProjectId, name);
    if (!loc) message = "&connected=1&pick=1";
  } catch (error) {
    message = `&error=${encodeURIComponent(error instanceof Error ? error.message : "link")}`;
  }
  revalidatePath("/dashboard/gbp");
  redirect(back(projectId, message));
}

/** Every not-yet-connected project whose name matches one of the newest
 *  grant's locations gets linked in one go. */
export async function linkAllGbpProjects(formData: FormData) {
  await assertAuthed();
  const returnTo = String(formData.get("project_id") ?? "");
  const [grant] = await existingGrants();
  if (!grant) redirect(back(returnTo, "&error=Connect%20one%20project%20with%20Google%20first."));
  const { data: src } = await db.from("gbp_connections").select("locations").eq("project_id", grant.sourceProjectId).maybeSingle();
  const locations = (src?.locations ?? []) as GbpLocation[];
  const [{ data: projects }, { data: connected }] = await Promise.all([
    db.from("client_projects").select("id, name"),
    db.from("gbp_connections").select("project_id"),
  ]);
  const done = new Set(((connected ?? []) as { project_id: string }[]).map((c) => c.project_id));
  let linked = 0;
  for (const p of (projects ?? []) as { id: string; name: string }[]) {
    if (done.has(p.id) || !matchLocation(locations, p.name)) continue;
    await linkFromGrant(p.id, grant.sourceProjectId, p.name);
    linked++;
  }
  revalidatePath("/dashboard/gbp");
  redirect(back(returnTo, `&linked=${linked}`));
}
