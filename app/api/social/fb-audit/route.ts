import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { db } from "@/lib/dashboard/db";
import { decryptAccountToken, facebookPageChoices, listAllSocialAccounts, saveFacebookPageMappings } from "@/lib/social-accounts";
import { decryptToken } from "@/lib/social-crypto";
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

/** `?debug=1`: Meta's debug_token for every stored Facebook login and Page token (validity, error, scopes —
 *  never the tokens), plus the app's own status. For "why did this login stop working". */
async function debugTokens() {
  const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
  const inspect = async (token: string) => {
    const res = await fetch(`${GRAPH_BASE}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`);
    const body = (await res.json().catch(() => ({}))) as { data?: Record<string, unknown>; error?: { message?: string } };
    if (body.error) return { lookup_error: body.error.message };
    const d = body.data ?? {};
    return {
      is_valid: d.is_valid,
      error: d.error,
      type: d.type,
      user_id: d.user_id,
      profile_id: d.profile_id,
      expires_at: d.expires_at,
      data_access_expires_at: d.data_access_expires_at,
      scopes: d.scopes,
    };
  };
  const { data: logins } = await db.from("social_connections").select("id, fb_user_id, fb_user_token_encrypted, connected_at");
  const loginReports = await Promise.all(
    ((logins ?? []) as { id: number; fb_user_id: string | null; fb_user_token_encrypted: string | null; connected_at: string | null }[])
      .filter((l) => l.fb_user_token_encrypted)
      .map(async (l) => ({ slot: l.id, fb_user_id: l.fb_user_id, connected_at: l.connected_at, ...(await inspect(decryptToken(l.fb_user_token_encrypted!))) }))
  );
  const pages = (await listAllSocialAccounts()).filter((a) => a.platform === "facebook" && a.is_active);
  // Which Instagram account Facebook sees linked to each Page (why an Instagram doesn't import).
  const linkedInstagram = async (pageId: string, token: string) => {
    const res = await fetch(
      `${GRAPH_BASE}/${pageId}?fields=instagram_business_account{id,username},connected_instagram_account{id,username}&access_token=${encodeURIComponent(token)}`
    );
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
    return body.error ? { ig_error: body.error.message } : { ig_business: body.instagram_business_account ?? null, ig_connected: body.connected_instagram_account ?? null };
  };
  const pageReports = await Promise.all(
    pages.map(async (a) => {
      const token = decryptAccountToken(a);
      return { page: a.label, login: a.fb_login_name ?? null, ...(await inspect(token)), ...(await linkedInstagram(a.external_id, token)) };
    })
  );
  const appRes = await fetch(`${GRAPH_BASE}/${process.env.META_APP_ID}?fields=name,category,link,privacy_policy_url,terms_of_service_url,user_support_url,app_domains,restrictions&access_token=${encodeURIComponent(appToken)}`);
  const app = await appRes.json().catch(() => ({}));
  return { app, logins: loginReports, pages: pageReports };
}

export async function GET(request: Request) {
  if (!(await isCronRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (new URL(request.url).searchParams.get("debug") === "1") return NextResponse.json(await debugTokens());
  // The Import Pages list as the dialog gets it (logins per Page, current login) — no tokens.
  if (new URL(request.url).searchParams.get("choices") === "1") return NextResponse.json({ choices: await facebookPageChoices() });
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
  const { ids, resubmit, move } = (await request.json()) as {
    ids?: string[];
    resubmit?: string[];
    /** Same as picking these Pages in Import Pages with a login chosen (saveFacebookPageMappings). */
    move?: { page_id: string; project_id: string; login_slot: 1 | 2 }[];
  };
  if (move?.length) {
    const valid = move.every(
      (m) => /^\d{1,30}$/.test(m.page_id) && /^[0-9a-f-]{36}$/.test(m.project_id) && (m.login_slot === 1 || m.login_slot === 2)
    );
    if (!valid) return NextResponse.json({ error: "Invalid move data." }, { status: 400 });
    try {
      return NextResponse.json({ changed: await saveFacebookPageMappings(move) });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
    }
  }
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
