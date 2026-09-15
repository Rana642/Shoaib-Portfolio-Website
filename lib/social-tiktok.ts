import "server-only";
import { db } from "./dashboard/db";
import { decryptField, isApiVaultCryptoConfigured } from "./api-vault-crypto";
import { encryptToken, decryptToken } from "./social-crypto";
import { decryptAccountToken, decryptAccountRefreshToken, updateTikTokAccountTokens } from "./social-accounts";
import { siteUrl } from "./seo";
import type { ClientSocialAccount } from "./dashboard/types";

/**
 * TikTok Content Posting API + Login Kit helpers. Unlike Meta/LinkedIn,
 * TikTok access tokens expire (~24h) and must be refreshed, and publishing
 * is asynchronous (an init call returns a publish_id you then poll) rather
 * than a single synchronous request — see getFreshTikTokAccessToken and
 * publishTikTokPhotoPost below for how those are handled.
 */

const TIKTOK_API_BASE = "https://open.tiktokapis.com";

type TikTokErrorShape = { error?: { code?: string; message?: string; log_id?: string } };

// TEMPORARY: TikTok's own app-review form requires demo footage of a
// working end-to-end integration, which requires actually connecting an
// account first — but the Production app's Redirect URI/scopes can't be
// tested pre-review without going through TikTok's separate Sandbox app
// (its own client_key/secret, saved as a second 'tiktok_sandbox' API Vault
// credential). Setting TIKTOK_SANDBOX_MODE=true in .env.local (never on
// Vercel) points every TikTok call at Sandbox instead of Production —
// unset it once the demo video is recorded and App Review is submitted.
const USE_SANDBOX = process.env.TIKTOK_SANDBOX_MODE === "true";

/** Debug helper for the temporary Sandbox rollout — lets a caller (the
 *  oauth-callback route) put which credential set was used directly into an
 *  error response, since Vercel's function logs are otherwise the only place
 *  to see it. Remove alongside TIKTOK_SANDBOX_MODE. */
export function tiktokCredentialModeForDebug(): string {
  return USE_SANDBOX ? "tiktok_sandbox" : "tiktok";
}

export async function getTikTokAppCredentials(): Promise<{ client_key: string; client_secret: string }> {
  if (!isApiVaultCryptoConfigured) throw new Error("API_VAULT_ENCRYPTION_KEY is not configured.");
  const service = USE_SANDBOX ? "tiktok_sandbox" : "tiktok";
  // Temporary debug line for the Sandbox rollout — check Vercel's function
  // logs to confirm which app a given authorize/callback request actually
  // used, since a mismatch between the two (one Sandbox, one Production)
  // surfaces as TikTok's generic "client key or secret is incorrect" at the
  // token-exchange step. Remove once TIKTOK_SANDBOX_MODE is retired.
  console.log(`[tiktok] using '${service}' credentials (TIKTOK_SANDBOX_MODE=${process.env.TIKTOK_SANDBOX_MODE ?? "unset"})`);
  const { data: row, error } = await db.from("api_credentials").select("fields").eq("service", service).maybeSingle();
  if (error || !row) throw new Error(`No '${service}' credential in the API Vault yet — save client_key/client_secret first.`);
  try {
    return { client_key: decryptField(row.fields.client_key), client_secret: decryptField(row.fields.client_secret) };
  } catch {
    throw new Error("Couldn't decrypt the stored TikTok client_key/client_secret.");
  }
}

export type TikTokTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  open_id: string;
  scope: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TikTokTokenResponse> {
  const { client_key, client_secret } = await getTikTokAppCredentials();
  const res = await fetch(`${TIKTOK_API_BASE}/v2/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: new URLSearchParams({ client_key, client_secret, ...body }),
  });
  const parsed = await res.json();
  if (!res.ok || parsed.error) {
    throw new Error(parsed.error_description || parsed.error || `TikTok token request failed (HTTP ${res.status})`);
  }
  return parsed as TikTokTokenResponse;
}

export async function exchangeTikTokCode(code: string, redirectUri: string): Promise<TikTokTokenResponse> {
  return tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri });
}

export async function refreshTikTokAccessToken(refreshToken: string): Promise<TikTokTokenResponse> {
  return tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
}

/** Every v2 Content Posting / user-info endpoint wraps its payload as
 *  { data, error } and — unlike a REST convention — returns error.code
 *  "ok" even on SUCCESS, so a truthy `error` object alone isn't a failure. */
async function apiPost<T>(path: string, accessToken: string, body: unknown): Promise<T> {
  const res = await fetch(`${TIKTOK_API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json()) as { data?: T } & TikTokErrorShape;
  if (!res.ok || (parsed.error?.code && parsed.error.code !== "ok")) {
    // TEMPORARY: include the raw error code/log_id, not just the message —
    // TikTok's message text is often a generic pointer to docs while the
    // code is the actually diagnostic part. Remove once TikTok publishing
    // is confirmed reliably working.
    const detail = [parsed.error?.code, parsed.error?.log_id].filter(Boolean).join(" / ");
    throw new Error(`${parsed.error?.message || `TikTok API error (HTTP ${res.status})`}${detail ? ` [${detail}]` : ""}`);
  }
  return parsed.data ?? ({} as T);
}

async function apiGet<T>(path: string, accessToken: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${TIKTOK_API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  const parsed = (await res.json()) as { data?: T } & TikTokErrorShape;
  if (!res.ok || (parsed.error?.code && parsed.error.code !== "ok")) {
    // TEMPORARY: include the raw error code/log_id, not just the message —
    // TikTok's message text is often a generic pointer to docs while the
    // code is the actually diagnostic part. Remove once TikTok publishing
    // is confirmed reliably working.
    const detail = [parsed.error?.code, parsed.error?.log_id].filter(Boolean).join(" / ");
    throw new Error(`${parsed.error?.message || `TikTok API error (HTTP ${res.status})`}${detail ? ` [${detail}]` : ""}`);
  }
  return parsed.data ?? ({} as T);
}

const REFRESH_MARGIN_MS = 10 * 60 * 1000; // refresh if less than 10 min of validity remains

/** Returns a usable TikTok access token for this account, refreshing it
 *  first if it's expired or close to it (access tokens last ~24h). Persists
 *  the rotated pair back to the row — TikTok's refresh_token itself rotates
 *  on every use, so the old one stops working right after. */
export async function getFreshTikTokAccessToken(account: ClientSocialAccount): Promise<string> {
  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
  if (expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return decryptAccountToken(account);
  }
  const refreshToken = decryptAccountRefreshToken(account);
  if (!refreshToken) throw new Error(`TikTok account "${account.label}" has no refresh token saved — reconnect it.`);
  const tokens = await refreshTikTokAccessToken(refreshToken);
  await updateTikTokAccountTokens(account.id, tokens);
  return tokens.access_token;
}

export type TikTokUserInfo = {
  open_id: string;
  display_name: string;
  avatar_url?: string;
  follower_count?: number;
  likes_count?: number;
};

export async function queryTikTokUserInfo(accessToken: string): Promise<TikTokUserInfo> {
  const { user } = await apiGet<{ user: TikTokUserInfo }>("/v2/user/info/", accessToken, {
    fields: "open_id,display_name,avatar_url,follower_count,likes_count",
  });
  return user;
}

export type TikTokVideoSummary = { id: string; title: string };

export async function listTikTokVideos(accessToken: string, maxCount = 5): Promise<TikTokVideoSummary[]> {
  const url = new URL(`${TIKTOK_API_BASE}/v2/video/list/`);
  url.searchParams.set("fields", "id,title");
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ max_count: maxCount }),
  });
  const parsed = (await res.json()) as { data?: { videos: TikTokVideoSummary[] } } & TikTokErrorShape;
  if (!res.ok || (parsed.error?.code && parsed.error.code !== "ok")) {
    throw new Error(parsed.error?.message || `TikTok video list failed (HTTP ${res.status})`);
  }
  return parsed.data?.videos ?? [];
}

export type TikTokPublishResult = { publish_id: string; status: string; failReason?: string };

type TikTokStatusResult = { status: string; fail_reason?: string };

/** TikTok's publish is async — polls a bounded number of times rather than
 *  holding the request open until moderation fully clears (which the docs
 *  say can take from under a minute to a few hours). Still PROCESSING after
 *  the budget isn't treated as a failure: TikTok already accepted the post,
 *  same as we don't track Meta's native-scheduled posts through to their
 *  final outcome either (see submitNativeSchedule in social-post.ts). */
async function pollTikTokPublishStatus(
  accessToken: string,
  publishId: string,
  attempts = 5,
  delayMs = 2500
): Promise<TikTokStatusResult> {
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const result = await apiPost<TikTokStatusResult>("/v2/post/publish/status/fetch/", accessToken, {
      publish_id: publishId,
    });
    if (result.status === "PUBLISH_COMPLETE" || result.status === "FAILED" || result.status === "SEND_TO_USER_INBOX") {
      return result;
    }
  }
  return { status: "PROCESSING" };
}

/** Publishes a photo post (TikTok's Content Posting API supports a photo/
 *  carousel mode alongside video) — the only mode that fits this app's
 *  image-based Planner queue. `photoUrls` must be publicly fetchable under a
 *  domain verified in the TikTok Developer Portal (adsbyshoaib.com already
 *  is) — see mintTikTokMediaUrl, which proxies R2 objects through that
 *  domain since R2's own bucket domain isn't verified.
 *
 *  Uses MEDIA_UPLOAD, not DIRECT_POST: an unaudited app (this one, until App
 *  Review approves public posting) can only DIRECT_POST to a creator account
 *  that's ALSO set to Private in its own TikTok settings — an account-level
 *  toggle, separate from and not satisfiable by this call's own
 *  privacy_level field, and one Shoaib's real test account couldn't hold
 *  (kept reverting to Public). MEDIA_UPLOAD sidesteps that restriction
 *  entirely: it hands the content to the creator's TikTok inbox as a draft
 *  they finish/publish themselves in the app, rather than direct-publishing
 *  via the API — which is also an explicitly legitimate, expected use of
 *  the video.upload scope (see TikTokConnectPanel.tsx's App Review copy),
 *  not a workaround being smuggled past review. */
export async function publishTikTokPhotoPost(
  accessToken: string,
  photoUrls: string[],
  caption: string
): Promise<TikTokPublishResult> {
  const { publish_id } = await apiPost<{ publish_id: string }>("/v2/post/publish/content/init/", accessToken, {
    media_type: "PHOTO",
    post_mode: "MEDIA_UPLOAD",
    post_info: {
      title: caption.slice(0, 90),
      description: caption.slice(0, 4000),
      brand_content_toggle: false,
      brand_organic_toggle: false,
    },
    source_info: {
      source: "PULL_FROM_URL",
      photo_images: photoUrls,
      photo_cover_index: 0,
    },
  });

  const status = await pollTikTokPublishStatus(accessToken, publish_id);
  return { publish_id, status: status.status, failReason: status.fail_reason };
}

const MEDIA_URL_TTL_MS = 15 * 60 * 1000;

// encryptToken/decryptToken emit standard base64 (+, /, = padding), which
// needs heavy %-escaping in a query string (the first real attempt's URL was
// almost entirely %2F-encoded) — converting to the URL-safe base64 alphabet
// keeps the token itself clean, in case TikTok's URL fetcher mishandled that.
function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(b64url: string): string {
  const padded = b64url.replace(/-/g, "+").replace(/_/g, "/");
  return padded + "=".repeat((4 - (padded.length % 4)) % 4);
}

/** Wraps an R2 object as a short-lived, publicly-fetchable URL under
 *  adsbyshoaib.com — TikTok's PULL_FROM_URL requires the URL's domain to be
 *  verified in the Developer Portal, and R2's own bucket/gateway domain
 *  isn't (only adsbyshoaib.com is, done earlier for exactly this). Security
 *  comes from the token being short-lived and unguessable (AES-256-GCM),
 *  not from auth — TikTok's own servers fetch this, not a logged-in user. */
export function mintTikTokMediaUrl(mediaKey: string): string {
  const token = encryptToken(JSON.stringify({ key: mediaKey, exp: Date.now() + MEDIA_URL_TTL_MS }));
  return `${siteUrl}/api/social/tiktok-media?t=${toBase64Url(token)}`;
}

export function verifyTikTokMediaToken(token: string): string {
  const { key, exp } = JSON.parse(decryptToken(fromBase64Url(token))) as { key: string; exp: number };
  if (Date.now() > exp) throw new Error("This media link has expired.");
  return key;
}

export type TikTokAccountSummary =
  | { ok: true; follower_count: number; likes_count: number; videos: TikTokVideoSummary[] }
  | { ok: false; error: string };

/** Best-effort live stats for the Social Connections page — never throws,
 *  same pattern as lib/social-insights.ts's per-section error cards, so one
 *  account with a stale/broken token doesn't break the whole page. */
export async function getTikTokAccountSummary(account: ClientSocialAccount): Promise<TikTokAccountSummary> {
  try {
    const token = await getFreshTikTokAccessToken(account);
    const [userInfo, videos] = await Promise.all([queryTikTokUserInfo(token), listTikTokVideos(token, 5)]);
    return {
      ok: true,
      follower_count: userInfo.follower_count ?? 0,
      likes_count: userInfo.likes_count ?? 0,
      videos,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
