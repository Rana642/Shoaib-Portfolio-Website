"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminUser } from "../auth";
import { db } from "../db";
import { deleteReviewReply, findLocation, gbpAccessToken, getGbpConnection, replyToReview } from "../../gbp";

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

export async function disconnectGbp(formData: FormData) {
  await assertAuthed();
  const projectId = String(formData.get("project_id") ?? "");
  await db.from("gbp_connections").delete().eq("project_id", projectId);
  revalidatePath("/dashboard/gbp");
  redirect(back(projectId, "&disconnected=1"));
}
