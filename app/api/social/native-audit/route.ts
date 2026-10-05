import { NextResponse } from "next/server";
import { db } from "@/lib/dashboard/db";
import { isCronRequest } from "@/lib/cron-auth";
import { decryptAccountToken } from "@/lib/social-accounts";
import { GRAPH_BASE, deleteFacebookPostStrict } from "@/lib/social-fb";
import type { ClientSocialAccount } from "@/lib/dashboard/types";

// TEMP (2026-10-05) — audits each Facebook Page's Meta-side scheduled
// posts against the planner, to clean up after the one-off resubmit.
// Delete once done.
export const maxDuration = 60;

type Native = { ok?: boolean; post_id?: string; external_id?: string };

async function graph(path: string, token: string) {
  const sep = path.includes("?") ? "&" : "?";
  return fetch(`${GRAPH_BASE}/${path}${sep}access_token=${encodeURIComponent(token)}`).then((r) => r.json());
}

export async function POST(request: Request) {
  if (!(await isCronRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { pageId?: string; deleteIds?: string[] };
  const { data: accounts } = await db.from("client_social_accounts").select("*").eq("platform", "facebook").eq("is_active", true);
  const fb = (accounts ?? []) as ClientSocialAccount[];

  if (body.pageId && body.deleteIds?.length) {
    const account = fb.find((a) => a.external_id === body.pageId);
    if (!account) return NextResponse.json({ error: "page not found" }, { status: 404 });
    const token = decryptAccountToken(account);
    const results = [];
    for (const id of body.deleteIds) {
      try {
        await deleteFacebookPostStrict(id, token);
        results.push({ id, deleted: true });
      } catch (e) {
        results.push({ id, deleted: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return NextResponse.json({ results });
  }

  const { data: posts } = await db
    .from("scheduled_posts")
    .select("id, project_id, scheduled_at, original_filename, result")
    .eq("status", "scheduled")
    .gte("scheduled_at", new Date().toISOString());
  const tracked = new Map<string, { postId: string; at: string; file: string }>();
  for (const p of posts ?? []) {
    for (const n of ((p.result as { native?: Native[] } | null)?.native ?? [])) {
      if (n.ok && n.post_id) tracked.set(n.post_id, { postId: p.id, at: p.scheduled_at, file: p.original_filename });
    }
  }
  const pages = body.pageId ? fb.filter((a) => a.external_id === body.pageId) : fb;
  const report = [];
  for (const a of pages) {
    const token = decryptAccountToken(a);
    const sched = await graph(`${a.external_id}/scheduled_posts?fields=id,scheduled_publish_time,created_time,message&limit=100`, token);
    const items = ((sched.data ?? []) as { id: string; scheduled_publish_time?: number; created_time?: string; message?: string }[]).map((s) => ({
      id: s.id,
      at: s.scheduled_publish_time ? new Date(s.scheduled_publish_time * 1000).toISOString() : null,
      created: s.created_time,
      msg: (s.message ?? "").slice(0, 40),
      tracked: tracked.get(s.id) ?? null,
    }));
    report.push({ page: a.label, pageId: a.external_id, error: sched.error?.message, scheduled: items });
  }
  return NextResponse.json({ trackedCount: tracked.size, report });
}
