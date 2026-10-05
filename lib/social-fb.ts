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

async function graphGet<T>(path: string, params: Record<string, string>, base = GRAPH_BASE): Promise<T> {
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const body = (await res.json()) as T & GraphError;
  if (!res.ok || body.error) {
    throw new Error(body.error?.message || `Graph API error (HTTP ${res.status})`);
  }
  return body;
}

/** The image of a photo this tool already published, for reposting it
 *  elsewhere after the original upload was cleared from storage. Instagram
 *  gives the full-size file; on Facebook a native-scheduled post id is a
 *  photo id (with `images`), a live one a feed post id (with `full_picture`). */
export async function publishedImageUrl(platform: "instagram" | "facebook", postId: string, token: string, base = GRAPH_BASE): Promise<string | null> {
  if (platform === "instagram") {
    const r = await graphGet<{ media_url?: string }>(`/${postId}`, { fields: "media_url", access_token: token }, base);
    return r.media_url ?? null;
  }
  try {
    const r = await graphGet<{ images?: { source: string; width: number }[] }>(`/${postId}`, { fields: "images", access_token: token });
    const best = [...(r.images ?? [])].sort((a, b) => b.width - a.width)[0];
    if (best) return best.source;
  } catch {
    /* a feed post id, not a photo id */
  }
  const r = await graphGet<{ full_picture?: string }>(`/${postId}`, { fields: "full_picture", access_token: token });
  return r.full_picture ?? null;
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

/** Whose Facebook profile a User token belongs to. */
export async function facebookMe(token: string): Promise<{ id: string; name: string }> {
  return graphGet<{ id: string; name: string }>("/me", { fields: "id,name", access_token: token });
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

/** Like deleteFacebookPost, but makes sure: throws unless Facebook confirms
 *  the delete or the post is already gone — for removing a planner post
 *  outright, where a draft left behind would still publish. */
export async function deleteFacebookPostStrict(postId: string, pageAccessToken: string): Promise<void> {
  const token = encodeURIComponent(pageAccessToken);
  const res = await fetch(`${GRAPH_BASE}/${postId}?access_token=${token}`, { method: "DELETE" });
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
  if (res.ok && body.success) return;
  const check = (await fetch(`${GRAPH_BASE}/${postId}?fields=id&access_token=${token}`).then((r) => r.json()).catch(() => ({}))) as { id?: string };
  if (check.id) throw new Error(`Facebook didn't cancel scheduled post ${postId}: ${body.error?.message ?? `HTTP ${res.status}`}`);
}

/** Instagram hard-caps API publishing at 100 posts / 24h per account (50 for
 *  carousels) — this checks the account's live usage against that before
 *  attempting a publish, so a busy day fails with a clear message instead of
 *  a confusing Graph API error (or, worse, silently contributing to a
 *  restriction). See https://developers.facebook.com/docs/instagram-platform/content-publishing */
async function assertInstagramPublishingHeadroom(igUserId: string, pageAccessToken: string, base: string): Promise<void> {
  const { data } = await graphGet<{ data: { quota_usage: number; config: { quota_total: number } }[] }>(
    `/${igUserId}/content_publishing_limit`,
    { fields: "config,quota_usage", access_token: pageAccessToken },
    base
  );
  const usage = data?.[0];
  if (usage && usage.quota_usage >= usage.config.quota_total) {
    throw new Error(
      `Instagram's 24-hour publishing limit is reached for this account (${usage.quota_usage}/${usage.config.quota_total}). It will free up as older posts age out of the rolling 24h window.`
    );
  }
}

/** Polls a just-created IG media container until Meta finishes processing it
 *  (status_code FINISHED) before we try to publish. Without this wait,
 *  media_publish can race the container's own processing and fail with
 *  "Media ID is not available" even though the container is perfectly
 *  valid — it just wasn't ready yet (hit in production 2026-09-16). Photo
 *  containers normally finish in a few seconds. */
async function waitForContainerFinished(containerId: string, pageAccessToken: string, base: string): Promise<void> {
  const maxAttempts = 20;
  const intervalMs = 1500;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { status_code } = await graphGet<{ status_code: string }>(
      `/${containerId}`,
      { fields: "status_code", access_token: pageAccessToken },
      base
    );
    if (status_code === "FINISHED") return;
    if (status_code === "ERROR" || status_code === "EXPIRED") {
      throw new Error(`Instagram media container ${status_code.toLowerCase()} before it could be published.`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Instagram media container did not finish processing in time — try again in a moment.");
}

// ── Reels ─────────────────────────────────────────────────────────────

const RUPLOAD_BASE = `https://rupload.facebook.com/video-upload/${GRAPH_VERSION}`;

/** A Facebook Page Reel from a video hosted at `videoUrl` (Reels Publishing
 *  API: start → upload by URL → finish). With `scheduledUnix` it's handed to
 *  Meta's own scheduler like a photo post; without, it publishes now.
 *  Facebook wants 3–90 seconds, 9:16. Returns the video id. */
export async function publishFacebookReel(
  pageId: string,
  pageAccessToken: string,
  videoUrl: string,
  description: string,
  scheduledUnix?: number
): Promise<FacebookPostResult> {
  const call = async (params: Record<string, string>) => {
    const res = await fetch(`${GRAPH_BASE}/${pageId}/video_reels`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...params, access_token: pageAccessToken }),
    });
    const body = (await res.json()) as { video_id?: string; success?: boolean } & GraphError;
    if (!res.ok || body.error) throw new Error(body.error?.message || `Facebook Reel ${params.upload_phase} failed (HTTP ${res.status})`);
    return { body, res };
  };

  const { body: start } = await call({ upload_phase: "start" });
  if (!start.video_id) throw new Error("Facebook didn't open a Reel upload.");

  const up = await fetch(`${RUPLOAD_BASE}/${start.video_id}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${pageAccessToken}`, file_url: videoUrl },
  });
  const upBody = (await up.json().catch(() => ({}))) as { success?: boolean; debug_info?: { message?: string } } & GraphError;
  if (!up.ok || upBody.error || upBody.success === false) {
    throw new Error(upBody.error?.message || upBody.debug_info?.message || `Facebook couldn't fetch the Reel video (HTTP ${up.status})`);
  }

  const { body: done, res } = await call({
    upload_phase: "finish",
    video_id: start.video_id,
    description,
    video_state: scheduledUnix ? "SCHEDULED" : "PUBLISHED",
    ...(scheduledUnix ? { scheduled_publish_time: String(scheduledUnix) } : {}),
  });
  if (done.success === false) throw new Error("Facebook didn't accept the Reel.");
  return { post_id: start.video_id, usagePercent: peakUsagePercent(res) };
}

async function pagePost<T>(path: string, params: Record<string, string>, pageAccessToken: string, what: string): Promise<{ body: T; res: Response }> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, access_token: pageAccessToken }),
  });
  const body = (await res.json()) as T & GraphError;
  if (!res.ok || body.error) throw new Error(body.error?.message || `${what} failed (HTTP ${res.status})`);
  return { body, res };
}

/** A Facebook Page photo Story (Page Stories API): the photo is uploaded
 *  unpublished, then published as a story. Stories can't be scheduled on
 *  Meta's side — the cron calls this at the post's time. */
export async function publishFacebookPhotoStory(pageId: string, pageAccessToken: string, imageUrl: string): Promise<FacebookPostResult> {
  const { body: photo } = await pagePost<{ id?: string }>(`/${pageId}/photos`, { url: imageUrl, published: "false" }, pageAccessToken, "Facebook story photo upload");
  if (!photo.id) throw new Error("Facebook didn't accept the story photo.");
  const { body, res } = await pagePost<{ success?: boolean; post_id?: string }>(`/${pageId}/photo_stories`, { photo_id: photo.id }, pageAccessToken, "Facebook story");
  if (body.success === false) throw new Error("Facebook didn't publish the story.");
  return { post_id: body.post_id || photo.id, usagePercent: peakUsagePercent(res) };
}

/** A Facebook Page video Story (up to 60 seconds, 9:16): start → upload by
 *  URL → finish, like a Reel. */
export async function publishFacebookVideoStory(pageId: string, pageAccessToken: string, videoUrl: string): Promise<FacebookPostResult> {
  const { body: start } = await pagePost<{ video_id?: string; upload_url?: string }>(`/${pageId}/video_stories`, { upload_phase: "start" }, pageAccessToken, "Facebook video story start");
  if (!start.video_id) throw new Error("Facebook didn't open a story upload.");
  const up = await fetch(start.upload_url || `${RUPLOAD_BASE}/${start.video_id}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${pageAccessToken}`, file_url: videoUrl },
  });
  const upBody = (await up.json().catch(() => ({}))) as { success?: boolean; debug_info?: { message?: string } } & GraphError;
  if (!up.ok || upBody.error || upBody.success === false) {
    throw new Error(upBody.error?.message || upBody.debug_info?.message || `Facebook couldn't fetch the story video (HTTP ${up.status})`);
  }
  const { body, res } = await pagePost<{ success?: boolean; post_id?: string }>(
    `/${pageId}/video_stories`,
    { upload_phase: "finish", video_id: start.video_id },
    pageAccessToken,
    "Facebook video story"
  );
  if (body.success === false) throw new Error("Facebook didn't publish the story.");
  return { post_id: body.post_id || start.video_id, usagePercent: peakUsagePercent(res) };
}

/** Starts an Instagram Story (photo or video) — same container flow as a
 *  Reel: create, wait for FINISHED, publish. */
export async function createInstagramStoryContainer(
  igUserId: string,
  token: string,
  media: { imageUrl: string } | { videoUrl: string },
  base = GRAPH_BASE
): Promise<string> {
  await assertInstagramPublishingHeadroom(igUserId, token, base);
  const res = await fetch(`${base}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      media_type: "STORIES",
      ...("videoUrl" in media ? { video_url: media.videoUrl } : { image_url: media.imageUrl }),
      access_token: token,
    }),
  });
  const body = (await res.json()) as { id?: string } & GraphError;
  if (!res.ok || body.error || !body.id) throw new Error(body.error?.message || "Instagram couldn't start the story.");
  return body.id;
}

/** Starts an Instagram Reel: creates the container, which Instagram then
 *  fetches and processes on its own (often longer than one cron run).
 *  Publish it with publishInstagramContainer once its status is FINISHED.
 *  `base` = graph.instagram.com for Instagram-login accounts. */
export async function createInstagramReelContainer(
  igUserId: string,
  token: string,
  videoUrl: string,
  caption: string,
  coverUrl: string | null,
  base = GRAPH_BASE
): Promise<string> {
  await assertInstagramPublishingHeadroom(igUserId, token, base);
  const res = await fetch(`${base}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      media_type: "REELS",
      video_url: videoUrl,
      caption,
      share_to_feed: "true",
      ...(coverUrl ? { cover_url: coverUrl } : {}),
      access_token: token,
    }),
  });
  const body = (await res.json()) as { id?: string } & GraphError;
  if (!res.ok || body.error || !body.id) throw new Error(body.error?.message || "Instagram couldn't start the Reel.");
  return body.id;
}

/** IN_PROGRESS | FINISHED | ERROR | EXPIRED | PUBLISHED, plus Instagram's
 *  explanation when it failed. */
export async function instagramContainerStatus(containerId: string, token: string, base = GRAPH_BASE): Promise<{ code: string; detail: string | null }> {
  const r = await graphGet<{ status_code?: string; status?: string }>(`/${containerId}`, { fields: "status_code,status", access_token: token }, base);
  return { code: r.status_code ?? "IN_PROGRESS", detail: r.status ?? null };
}

export async function publishInstagramContainer(igUserId: string, token: string, containerId: string, base = GRAPH_BASE): Promise<FacebookPostResult> {
  const res = await fetch(`${base}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: containerId, access_token: token }),
  });
  const body = (await res.json()) as { id?: string } & GraphError;
  if (!res.ok || body.error) throw new Error(body.error?.message || "Instagram publish failed");
  return { post_id: body.id || "", usagePercent: peakUsagePercent(res) };
}

/** Two-step Instagram publish: create a media container, then publish it.
 *  Needs a Business/Creator account — either linked to a Facebook Page (Page
 *  token, graph.facebook.com) or connected through Instagram Login (its own
 *  token, graph.instagram.com — pass that host as `base`).
 *  Instagram has no native "schedule for later" API at all (unlike
 *  Facebook) — every third-party tool, including this one, has to hold the
 *  post and call this at the right time itself. */
export async function postInstagramPhoto(
  igUserId: string,
  pageAccessToken: string,
  imageUrl: string,
  caption: string,
  base = GRAPH_BASE
): Promise<FacebookPostResult> {
  await assertInstagramPublishingHeadroom(igUserId, pageAccessToken, base);

  const createRes = await fetch(`${base}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ image_url: imageUrl, caption, access_token: pageAccessToken }),
  });
  const created = (await createRes.json()) as { id?: string } & GraphError;
  if (!createRes.ok || created.error || !created.id) {
    throw new Error(created.error?.message || "Instagram media container creation failed");
  }

  await waitForContainerFinished(created.id, pageAccessToken, base);

  const publishRes = await fetch(`${base}/${igUserId}/media_publish`, {
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
