import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/dashboard/auth";
import { GRAPH_BASE } from "@/lib/social-fb";
import { listSocialAccountsForProject, decryptAccountToken } from "@/lib/social-accounts";

/**
 * TEMPORARY (2026-10-14): returns Meta's raw answers for the organic vs paid
 * breakdowns so the Insights split can be built against the real response
 * shape. Admin-only, never returns a token. Remove once the split ships.
 */
export const dynamic = "force-dynamic";

async function raw(path: string, params: Record<string, string>) {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { cache: "no-store" });
  return res.json();
}

export async function GET(req: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const project = new URL(req.url).searchParams.get("project");
  if (!project) return NextResponse.json({ error: "project required" }, { status: 400 });

  const now = Math.floor(Date.now() / 1000);
  const since = String(now - 28 * 86400);
  const until = String(now);
  const out: Record<string, unknown> = {};

  for (const a of await listSocialAccountsForProject(project)) {
    if (a.token_expires_at) continue;
    const token = decryptAccountToken(a);
    const id = a.external_id;
    if (a.platform === "facebook") {
      out.fb_day_breakdown = await raw(`/${id}/insights`, { metric: "page_media_view", breakdown: "is_from_ads", period: "day", since: String(now - 4 * 86400), until, access_token: token });
      out.fb_28_breakdown = await raw(`/${id}/insights`, { metric: "page_media_view", breakdown: "is_from_ads", period: "days_28", since: String(now - 86400), until, access_token: token });
      out.fb_video_paid_organic = await raw(`/${id}/insights`, { metric: "page_video_views_paid,page_video_views_organic", period: "days_28", since: String(now - 86400), until, access_token: token });
      const posts = (await raw(`/${id}/published_posts`, { fields: "id,created_time", limit: "3", access_token: token })) as { data?: { id: string }[] };
      out.fb_posts = await Promise.all(
        (posts.data ?? []).map(async (p) => ({
          id: p.id,
          breakdown: await raw(`/${p.id}/insights`, { metric: "post_media_view", breakdown: "is_from_ads", access_token: token }),
        }))
      );
    } else if (a.platform === "instagram") {
      out.ig_breakdown = await raw(`/${id}/insights`, {
        metric: "views,reach,likes,comments,shares,saves,total_interactions",
        period: "day",
        metric_type: "total_value",
        breakdown: "media_product_type",
        since,
        until,
        access_token: token,
      });
      out.ig_follow_type = await raw(`/${id}/insights`, { metric: "reach", period: "day", metric_type: "total_value", breakdown: "follow_type", since, until, access_token: token });
      const media = (await raw(`/${id}/media`, { fields: "id,timestamp,media_product_type", limit: "6", access_token: token })) as { data?: { id: string }[] };
      out.ig_media = await Promise.all(
        (media.data ?? []).map(async (m) => ({
          ...m,
          organic: await raw(`/${m.id}/insights`, { metric: "views,likes,comments,reach,shares,saved", access_token: token }),
          total: await raw(`/${m.id}/insights`, { metric: "total_views,total_likes,total_comments", access_token: token }),
        }))
      );
    }
  }
  return NextResponse.json(out);
}
