import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { db } from "@/lib/dashboard/db";
import { decryptAccountToken, listAllSocialAccounts } from "@/lib/social-accounts";
import { GRAPH_BASE, deleteFacebookPostStrict } from "@/lib/social-fb";
import { getScheduledPost } from "@/lib/scheduled-posts";
import { isWithinNativeScheduleWindow, submitNativeSchedule, type PlatformPostResult } from "@/lib/social-post";

// TEMPORARY, read-only (2026-10-30): which Planner Facebook posts Meta really
// published or still holds as scheduled, per Page. Remove once the audit is done.
export const maxDuration = 60;

type Graph = { data?: { id: string; created_time?: string; scheduled_publish_time?: number }[]; error?: { message?: string } };

async function graph(path: string, token: string): Promise<Graph & Record<string, unknown>> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${GRAPH_BASE}${path}${sep}access_token=${encodeURIComponent(token)}`);
  const body = (await res.json().catch(() => ({}))) as Graph & Record<string, unknown>;
  delete body.paging; // paging URLs carry the token
  return body;
}

export async function GET(request: Request) {
  if (!(await isCronRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const since = new URL(request.url).searchParams.get("since") ?? "2026-10-20";

  const accounts = (await listAllSocialAccounts()).filter((a) => a.platform === "facebook" && a.is_active);
  const { data: rows } = await db
    .from("scheduled_posts")
    .select("id,project_id,status,scheduled_at,post_type,result")
    .gte("scheduled_at", since)
    .neq("post_type", "story");

  const pages = await Promise.all(
    accounts.map(async (a) => {
      const token = decryptAccountToken(a);
      const planner: { row: string; at: string; status: string; post_id: string; native: boolean }[] = [];
      for (const r of (rows ?? []) as { id: string; project_id: string; status: string; scheduled_at: string; result: Record<string, unknown> | null }[]) {
        if (r.project_id !== a.project_id) continue;
        const res = r.result ?? {};
        for (const key of ["platforms", "live", "native"]) {
          for (const x of (res[key] as { platform?: string; ok?: boolean; post_id?: string; native?: boolean }[] | undefined) ?? []) {
            if (x.platform === "facebook" && x.ok && x.post_id) planner.push({ row: r.id, at: r.scheduled_at, status: r.status, post_id: x.post_id, native: !!x.native });
          }
        }
      }
      const [scheduled, published] = await Promise.all([
        graph(`/${a.external_id}/scheduled_posts?fields=id,created_time,scheduled_publish_time&limit=100`, token),
        graph(`/${a.external_id}/published_posts?fields=id,created_time&since=${since}&limit=100`, token),
      ]);
      const sched = new Map((scheduled.data ?? []).map((p) => [p.id, p]));
      const pub = new Set((published.data ?? []).map((p) => p.id));
      const checks = await Promise.all(
        planner.map(async (p) => {
          if (pub.has(p.post_id)) return { ...p, meta: "published" };
          const s = sched.get(p.post_id);
          if (s) return { ...p, meta: "scheduled", created: s.created_time, fires: s.scheduled_publish_time ? new Date(s.scheduled_publish_time * 1000).toISOString() : null };
          const probe = await graph(`/${p.post_id}?fields=id,is_published,created_time,scheduled_publish_time`, token);
          return { ...p, meta: probe.error ? `missing: ${probe.error.message}` : `other: published=${String(probe.is_published)}`, created: probe.created_time };
        })
      );
      const tracked = new Set(planner.map((p) => p.post_id));
      return {
        project_id: a.project_id,
        page: a.label,
        page_id: a.external_id,
        login: a.fb_login_name ?? null,
        errors: [scheduled.error?.message, published.error?.message].filter(Boolean),
        published_count: pub.size,
        meta_scheduled_count: sched.size,
        untracked_scheduled: [...sched.values()].filter((s) => !tracked.has(s.id)),
        posts: checks,
      };
    })
  );
  return NextResponse.json({ since, pages });
}

/** `ids`: strictly deletes the given stuck Meta-side posts ("{page}_{post}"), each with its own Page's token.
 *  `resubmit`: Planner row ids whose upcoming native Facebook drafts are cancelled (strictly) and handed
 *  to Meta again with the Page's current token, at the same time. Keep to ~3 rows per call (60 s limit). */
export async function POST(request: Request) {
  if (!(await isCronRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { ids, resubmit } = (await request.json()) as { ids?: string[]; resubmit?: string[] };
  const accounts = (await listAllSocialAccounts()).filter((a) => a.platform === "facebook" && a.is_active);
  if (resubmit?.length) {
    const results = [];
    for (const rowId of resubmit) {
      try {
        const post = await getScheduledPost(rowId);
        if (!post || post.status !== "scheduled" || !post.caption || !post.scheduled_at) throw new Error("not a scheduled, captioned post");
        if (!isWithinNativeScheduleWindow(post.scheduled_at)) throw new Error("outside Meta's 10 min – 30 day window");
        const result = (post.result ?? {}) as { native?: PlatformPostResult[] };
        for (const r of (result.native ?? []).filter((n) => n.native && n.ok && n.post_id)) {
          const account = accounts.find((a) => a.external_id === r.external_id);
          if (!account) throw new Error(`Page ${r.external_id} not connected`);
          await deleteFacebookPostStrict(r.post_id!, decryptAccountToken(account));
        }
        const fresh = await submitNativeSchedule(post.project_id, post.media_key, post.caption, post.scheduled_at, post.target_platforms, post.post_type);
        const { error } = await db.from("scheduled_posts").update({ result: { ...result, native: fresh } }).eq("id", rowId);
        if (error) throw new Error(error.message);
        results.push({ id: rowId, ok: fresh.every((f) => f.ok), native: fresh.map((f) => (f.ok ? f.post_id : `FAIL ${f.error}`)) });
      } catch (e) {
        results.push({ id: rowId, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return NextResponse.json({ results });
  }
  const results = await Promise.all(
    (ids ?? []).map(async (id) => {
      const account = accounts.find((a) => a.external_id === id.split("_")[0]);
      if (!account) return { id, ok: false, error: "no connected Page" };
      try {
        await deleteFacebookPostStrict(id, decryptAccountToken(account));
        return { id, ok: true };
      } catch (e) {
        return { id, ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    })
  );
  return NextResponse.json({ results });
}
