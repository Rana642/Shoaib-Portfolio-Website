import "server-only";

/**
 * Meta Graph API helpers. Shoaib is an admin on every client's Facebook
 * Page himself, so this discovers Pages via his own login rather than doing
 * per-client OAuth — see the note in supabase/dashboard-schema.sql.
 */

// The live API already answers this app's v21.0 requests as v26.0 (the
// `facebook-api-version` response header) — Meta won't serve an app an older
// version than the one current when the app was created — so name the
// version that's actually in effect rather than a misleading older one.
const GRAPH_VERSION = "v26.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

type GraphError = { error?: { message?: string; type?: string; code?: number } };

/** Reads whichever Business Use Case / Page usage header Meta attached to
 *  this response and returns the highest reported percentage (0-100), so
 *  callers can back off before actually hitting a limit rather than after.
 *  See https://developers.facebook.com/docs/graph-api/overview/rate-limiting/ */
function peakUsagePercent(res: Response): number | null {
  const headerNames = ["x-business-use-case-usage", "x-page-usage", "x-app-usage", "x-ad-account-usage"];
  let peak: number | null = null;
  for (const name of headerNames) {
    const raw = res.headers.get(name);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      // Shapes vary: {"<id>":[{"call_count":N,...}]} for BUC, or a flat
      // {"call_count":N,"total_time":N,"total_cputime":N} for app/page usage.
      const values: number[] = [];
      const collect = (obj: unknown) => {
        if (!obj || typeof obj !== "object") return;
        for (const [key, val] of Object.entries(obj)) {
          if (typeof val === "number" && /call_count|total_time|total_cputime/.test(key)) values.push(val);
          else if (Array.isArray(val)) val.forEach(collect);
          else if (typeof val === "object") collect(val);
        }
      };
      collect(parsed);
      for (const v of values) if (peak === null || v > peak) peak = v;
    } catch {
      /* header present but not JSON we understand — ignore */
    }
  }
  return peak;
}

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const body = (await res.json()) as T & GraphError;
  if (!res.ok || body.error) {
    throw new Error(body.error?.message || `Graph API error (HTTP ${res.status})`);
  }
  return body;
}

/** Exchanges a short-lived User Access Token (from Graph API Explorer) for a
 *  long-lived one (~60 days) — required before deriving Page tokens that
 *  themselves become effectively permanent. */
export async function exchangeForLongLivedUserToken(
  shortLivedToken: string
): Promise<{ access_token: string; expires_in: number | null }> {
  const appId = process.env.META_APP_ID || "";
  const appSecret = process.env.META_APP_SECRET || "";
  if (!appId || !appSecret) {
    throw new Error("META_APP_ID / META_APP_SECRET are not configured in .env.local.");
  }
  // A System User token doesn't expire, so Meta's response omits expires_in
  // entirely rather than sending 0 — normalize that to null.
  const result = await graphGet<{ access_token: string; expires_in?: number }>("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });
  return { access_token: result.access_token, expires_in: result.expires_in ?? null };
}

export type DiscoveredPage = {
  page_id: string;
  name: string;
  /** Page Access Token derived from a long-lived User token — doesn't expire
   *  on its own as long as the User token that produced it stays valid. */
  page_access_token: string;
  instagram_business_account_id: string | null;
};

/** Lists every Facebook Page the given User token's owner administers,
 *  including each Page's linked Instagram Business Account (if any). */
export async function listManagedPages(longLivedUserToken: string): Promise<DiscoveredPage[]> {
  const { data } = await graphGet<{
    data: { id: string; name: string; access_token: string; instagram_business_account?: { id: string } }[];
  }>("/me/accounts", {
    fields: "id,name,access_token,instagram_business_account",
    access_token: longLivedUserToken,
    limit: "100",
  });

  return data.map((p) => ({
    page_id: p.id,
    name: p.name,
    page_access_token: p.access_token,
    instagram_business_account_id: p.instagram_business_account?.id ?? null,
  }));
}

export type FacebookPostResult = { post_id: string; usagePercent: number | null };

/** Posts a photo (with caption) immediately to a Facebook Page's feed. Used
 *  by the cron for platforms that can't be natively scheduled (Instagram
 *  always; Facebook only when scheduleFacebookPhoto wasn't usable). */
export async function postFacebookPhoto(
  pageId: string,
  pageAccessToken: string,
  imageUrl: string,
  caption: string
): Promise<FacebookPostResult> {
  const res = await fetch(`${GRAPH_BASE}/${pageId}/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ url: imageUrl, caption, access_token: pageAccessToken }),
  });
  const body = (await res.json()) as { id?: string; post_id?: string } & GraphError;
  if (!res.ok || body.error) throw new Error(body.error?.message || `Facebook post failed (HTTP ${res.status})`);
  return { post_id: body.post_id || body.id || "", usagePercent: peakUsagePercent(res) };
}

/** Submits a photo post to Meta's own scheduler (published=false +
 *  scheduled_publish_time) — Meta's servers fire the actual publish at that
 *  time, so this looks exactly like a person using Facebook's native
 *  scheduling, not an app "pushing" a post at the last second. Meta only
 *  accepts a window of 10 minutes to 30 days ahead; callers must check that
 *  before calling this (see isWithinNativeScheduleWindow in social-post.ts).
 *  Facebook's public docs only show this for /feed, but /photos accepts the
 *  same two params in practice (widely used by other scheduling tools). */
export async function scheduleFacebookPhoto(
  pageId: string,
  pageAccessToken: string,
  imageUrl: string,
  caption: string,
  scheduledUnixSeconds: number
): Promise<FacebookPostResult> {
  const res = await fetch(`${GRAPH_BASE}/${pageId}/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      url: imageUrl,
      caption,
      access_token: pageAccessToken,
      published: "false",
      scheduled_publish_time: String(scheduledUnixSeconds),
    }),
  });
  const body = (await res.json()) as { id?: string; post_id?: string } & GraphError;
  if (!res.ok || body.error) {
    throw new Error(body.error?.message || `Facebook scheduling failed (HTTP ${res.status})`);
  }
  return { post_id: body.post_id || body.id || "", usagePercent: peakUsagePercent(res) };
}

/** Deletes an unpublished (natively-scheduled) Facebook post — used when a
 *  post gets dragged to a different day in the planner after it was already
 *  handed to Meta's scheduler, so the stale Meta-side draft doesn't also
 *  fire at the old time (which would double-post). Best-effort: swallow
 *  failures rather than block the reschedule, since a delete failing here
 *  just risks an old draft nobody wanted rather than losing data. */
export async function deleteFacebookPost(postId: string, pageAccessToken: string): Promise<void> {
  await fetch(`${GRAPH_BASE}/${postId}?access_token=${encodeURIComponent(pageAccessToken)}`, { method: "DELETE" });
}

/** Instagram hard-caps API publishing at 100 posts / 24h per account (50 for
 *  carousels) — this checks the account's live usage against that before
 *  attempting a publish, so a busy day fails with a clear message instead of
 *  a confusing Graph API error (or, worse, silently contributing to a
 *  restriction). See https://developers.facebook.com/docs/instagram-platform/content-publishing */
async function assertInstagramPublishingHeadroom(igUserId: string, pageAccessToken: string): Promise<void> {
  const { data } = await graphGet<{ data: { quota_usage: number; config: { quota_total: number } }[] }>(
    `/${igUserId}/content_publishing_limit`,
    { fields: "config,quota_usage", access_token: pageAccessToken }
  );
  const usage = data?.[0];
  if (usage && usage.quota_usage >= usage.config.quota_total) {
    throw new Error(
      `Instagram's 24-hour publishing limit is reached for this account (${usage.quota_usage}/${usage.config.quota_total}). It will free up as older posts age out of the rolling 24h window.`
    );
  }
}

/** Two-step Instagram publish: create a media container, then publish it.
 *  Requires the IG account to be a Business/Creator account linked to a
 *  Facebook Page — Meta does not allow API posting to a standalone account.
 *  Instagram has no native "schedule for later" API at all (unlike
 *  Facebook) — every third-party tool, including this one, has to hold the
 *  post and call this at the right time itself. */
export async function postInstagramPhoto(
  igUserId: string,
  pageAccessToken: string,
  imageUrl: string,
  caption: string
): Promise<FacebookPostResult> {
  await assertInstagramPublishingHeadroom(igUserId, pageAccessToken);

  const createRes = await fetch(`${GRAPH_BASE}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ image_url: imageUrl, caption, access_token: pageAccessToken }),
  });
  const created = (await createRes.json()) as { id?: string } & GraphError;
  if (!createRes.ok || created.error || !created.id) {
    throw new Error(created.error?.message || "Instagram media container creation failed");
  }

  const publishRes = await fetch(`${GRAPH_BASE}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: created.id, access_token: pageAccessToken }),
  });
  const published = (await publishRes.json()) as { id?: string } & GraphError;
  if (!publishRes.ok || published.error) {
    throw new Error(published.error?.message || "Instagram publish failed");
  }
  return { post_id: published.id || "", usagePercent: peakUsagePercent(publishRes) };
}
