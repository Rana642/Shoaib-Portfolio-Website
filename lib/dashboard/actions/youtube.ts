"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminUser } from "../auth";
import { getFreshYouTubeAccessToken } from "../../social-youtube";
import { projectYouTubeAccount, replyToComment, updateVideoSeo } from "../../youtube-manage";

async function assertAuthed() {
  const user = await getAdminUser();
  if (!user) redirect("/dashboard/login");
}

const back = (projectId: string, tab: string, extra = "") => `/dashboard/youtube?project=${projectId}&tab=${tab}${extra}`;

async function tokenFor(projectId: string) {
  const account = await projectYouTubeAccount(projectId);
  if (!account) throw new Error("This project has no YouTube channel connected.");
  return getFreshYouTubeAccessToken(account);
}

/** Saves a video's title, description and tags (Videos tab). */
export async function saveVideoSeo(formData: FormData) {
  await assertAuthed();
  const projectId = String(formData.get("project_id") ?? "");
  const videoId = String(formData.get("video_id") ?? "");
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  let message = `&saved=${encodeURIComponent(videoId)}`;
  try {
    await updateVideoSeo(await tokenFor(projectId), videoId, {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      tags,
    });
  } catch (error) {
    message = `&error=${encodeURIComponent(error instanceof Error ? error.message : "Couldn't save the video.")}`;
  }
  revalidatePath("/dashboard/youtube");
  redirect(back(projectId, "videos", `${message}#v-${videoId}`));
}

/** Posts the channel's reply to a comment (Comments tab). */
export async function replyYouTubeComment(formData: FormData) {
  await assertAuthed();
  const projectId = String(formData.get("project_id") ?? "");
  const filter = formData.get("filter") === "all" ? "&filter=all" : "";
  let message = `${filter}&replied=1`;
  try {
    await replyToComment(await tokenFor(projectId), String(formData.get("comment_id") ?? ""), String(formData.get("text") ?? ""));
  } catch (error) {
    message = `${filter}&error=${encodeURIComponent(error instanceof Error ? error.message : "Couldn't post the reply.")}`;
  }
  revalidatePath("/dashboard/youtube");
  redirect(back(projectId, "comments", message));
}
