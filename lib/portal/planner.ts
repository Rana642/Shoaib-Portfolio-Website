"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/dashboard/db";
import { can, canSeeProject, getPortalUser, type PortalContext } from "@/lib/portal/auth";
import { createScheduledPost, dateToScheduledAt, deleteScheduledPost, getScheduledPost } from "@/lib/scheduled-posts";
import { resend, isResendConfigured, fromEmail, toEmail } from "@/lib/resend";

// Client-portal uploads: final, approved graphics go straight onto the
// planner as ordinary 'pending_caption' posts. Nothing publishes until the
// caption is written and it's scheduled (the existing Planner / MCP flow).

async function uploaderContext(projectId: string): Promise<PortalContext | { error: string }> {
  const ctx = await getPortalUser();
  if (!ctx) return { error: "Your session has ended — sign in again." };
  if (!can(ctx, "uploads")) return { error: "Uploading isn't switched on for you." };
  const { data: project } = await db.from("client_projects").select("id").eq("id", projectId).eq("client_id", ctx.clientId).maybeSingle();
  if (!project || !canSeeProject(ctx, projectId)) return { error: "That project isn't one of yours." };
  return ctx;
}

const uploadSchema = z.object({
  projectId: z.string().uuid(),
  // Required: the Planner calendar only shows dated posts (Shoaib can
  // drag it to another day afterwards).
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the day it should go out."),
  note: z.string().trim().max(1000).nullable(),
  files: z.array(z.object({ key: z.string().min(1).max(512), name: z.string().min(1).max(300) })).min(1).max(30),
});

/** Turns uploaded files into planner posts, and lets Shoaib know. */
export async function createPortalUploads(input: z.infer<typeof uploadSchema>) {
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Those uploads couldn't be read." };
  const { projectId, date, note, files } = parsed.data;
  const ctx = await uploaderContext(projectId);
  if ("error" in ctx) return ctx;

  // Only files uploaded into this project's own folder — never a key that
  // points somewhere else in the bucket.
  const prefix = `social/${projectId}/`;
  if (files.some((f) => !f.key.startsWith(prefix) || f.key.includes(".."))) return { error: "Those uploads couldn't be read." };

  const email = ctx.user.email ?? "client";
  let created = 0;
  for (const [i, file] of files.entries()) {
    const post = {
      project_id: projectId,
      media_key: file.key,
      original_filename: file.name,
      scheduled_at: dateToScheduledAt(date, i * 5),
    };
    try {
      await createScheduledPost({ ...post, fromClient: { email, note: note || null } });
    } catch {
      // Before the uploader/note columns exist: still save the post itself.
      try {
        await createScheduledPost(post);
      } catch {
        return { error: created ? `Saved ${created} of ${files.length} — please try the rest again.` : "Couldn't save your uploads — please try again." };
      }
    }
    created++;
  }

  if (isResendConfigured) {
    const [{ data: client }, { data: project }] = await Promise.all([
      db.from("clients").select("name").eq("id", ctx.clientId).maybeSingle(),
      db.from("client_projects").select("name").eq("id", projectId).maybeSingle(),
    ]);
    await resend.emails
      .send({
        from: fromEmail,
        to: toEmail,
        subject: `${project?.name ?? client?.name ?? "A client"}: ${created} new graphic${created === 1 ? "" : "s"} uploaded`,
        text: `${email} (${client?.name ?? "client"}) uploaded ${created} graphic${created === 1 ? "" : "s"} for ${project?.name ?? "a project"} through the client portal.\nFor: ${date}${
          note ? `\nNote: ${note}` : ""
        }\n\nThey're on the Planner, waiting for captions.`,
      })
      .catch((e: unknown) => console.error("[portal] upload notify failed:", e));
  }

  revalidatePath("/portal/planner");
  revalidatePath("/dashboard/social/planner");
  return { ok: true, created };
}

/** A client can take back their own upload while it's still waiting for a
 *  caption — never a post Shoaib made or one already scheduled/posted. */
export async function deletePortalUpload(postId: string) {
  if (!z.string().uuid().safeParse(postId).success) return { error: "Not found." };
  const post = await getScheduledPost(postId);
  if (!post) return { error: "Not found." };
  const ctx = await uploaderContext(post.project_id);
  if ("error" in ctx) return ctx;
  if (!post.uploaded_by_email || post.status !== "pending_caption") {
    return { error: "This one is already being prepared — ask me if it needs to change." };
  }
  await deleteScheduledPost(post.id);
  revalidatePath("/portal/planner");
  revalidatePath("/dashboard/social/planner");
  return { ok: true };
}
