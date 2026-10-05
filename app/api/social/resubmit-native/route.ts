import { NextResponse } from "next/server";
import { db } from "@/lib/dashboard/db";
import { isCronRequest } from "@/lib/cron-auth";
import { rescheduleNativePosts } from "@/lib/social-post";
import { listSocialAccountsForProject, decryptAccountToken } from "@/lib/social-accounts";
import { GRAPH_BASE } from "@/lib/social-fb";

// TEMP (2026-10-05) — one-off: moves upcoming photo posts from the old
// /photos scheduling (Photos album only) to scheduled /feed posts. Delete
// once it has run.
export const maxDuration = 60;

type Native = { ok?: boolean; post_id?: string; error?: string; external_id?: string };

export async function POST(request: Request) {
  if (!(await isCronRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limit = Math.min(Number(new URL(request.url).searchParams.get("limit") ?? 8), 15);
  const { data, error } = await db
    .from("scheduled_posts")
    .select("id, project_id, scheduled_at, post_type, result")
    .eq("status", "scheduled")
    .gte("scheduled_at", new Date(Date.now() + 12 * 60e3).toISOString())
    .order("scheduled_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const todo = (data ?? []).filter(
    (r) => (r.post_type ?? "post") === "post" && ((r.result as { native?: Native[] } | null)?.native ?? []).some((n) => n.ok && n.post_id && !n.post_id.includes("_"))
  );
  const out = [];
  for (const r of todo.slice(0, limit)) {
    const old = ((r.result as { native?: Native[] }).native ?? []).filter((n) => n.ok && n.post_id && !n.post_id.includes("_"));
    await rescheduleNativePosts(r.id);
    const { data: after } = await db.from("scheduled_posts").select("result").eq("id", r.id).single();
    const accounts = await listSocialAccountsForProject(r.project_id);
    const oldGone = [];
    for (const n of old) {
      const account = accounts.find((a) => a.external_id === n.external_id);
      if (!account) continue;
      const check = await fetch(`${GRAPH_BASE}/${n.post_id}?fields=id&access_token=${encodeURIComponent(decryptAccountToken(account))}`).then((x) => x.json());
      oldGone.push({ old: n.post_id, gone: Boolean(check.error) });
    }
    out.push({ id: r.id, at: r.scheduled_at, native: ((after?.result as { native?: Native[] } | null)?.native ?? []).map((n) => ({ ok: n.ok, post_id: n.post_id, error: n.error })), oldGone });
  }
  return NextResponse.json({ remaining: todo.length - out.length, done: out });
}
