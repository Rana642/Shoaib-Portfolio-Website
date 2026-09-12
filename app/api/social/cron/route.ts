import { NextResponse } from "next/server";
import { listDuePosts, markPostResult } from "@/lib/scheduled-posts";
import { postToAllProjectAccounts } from "@/lib/social-post";
import { presignDownload } from "@/lib/storage";

/**
 * Fires due scheduled_posts (status='scheduled', scheduled_at <= now).
 * Called by Vercel Cron (see vercel.json) — protected by CRON_SECRET since
 * this is otherwise an unauthenticated route that publishes to real accounts.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const due = await listDuePosts();
  const results = [];

  for (const post of due) {
    try {
      const imageUrl = await presignDownload(post.media_key);
      const platformResults = await postToAllProjectAccounts(post.project_id, imageUrl, post.caption ?? "");
      const ok = platformResults.every((r) => r.ok);
      await markPostResult(post.id, ok, { platforms: platformResults });
      results.push({ id: post.id, ok, platforms: platformResults });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markPostResult(post.id, false, { error: message });
      results.push({ id: post.id, ok: false, error: message });
    }
  }

  return NextResponse.json({ checked: due.length, results });
}
