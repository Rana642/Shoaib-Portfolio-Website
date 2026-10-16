import "server-only";
import { db } from "./dashboard/db";
import { getVaultCredential } from "./marketing-vault";
import { decryptToken, encryptToken } from "./social-crypto";
import { GBP_CALLBACK_PATH } from "./gbp";
import type { ClientSocialAccount } from "./dashboard/types";

/**
 * YouTube, per client project — the channel is connected with Google
 * sign-in and posted to as a Short from the Planner's Reel flow. It uses the
 * same "Socially Snap" Google OAuth client as Google Business (API Vault
 * service "gmb") and the same registered redirect URI (/api/gbp/callback),
 * told apart by a "yt:" prefix on `state`, so no new redirect URI or client
 * is needed. The YouTube Data API v3 and YouTube Analytics API must be
 * enabled on that Google Cloud project.
 *
 * Until the project passes YouTube's API audit, Google forces every video
 * uploaded through the API to private — the upload still works, it just
 * isn't public until someone changes it in YouTube Studio.
 */

export const YOUTUBE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  // Comment replies, and editing video titles/descriptions/tags (lib/youtube-manage.ts).
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  // Revenue in the growth report, for monetized channels.
  "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
];

/** `state` prefix that routes the shared Google callback to YouTube. */
export const YOUTUBE_STATE_PREFIX = "yt:";

async function appCredentials() {
  const cred = await getVaultCredential("gmb");
  if (!cred.client_id || !cred.client_secret) throw new Error("The 'gmb' credential in the API Vault needs client_id and client_secret (Socially Snap OAuth client).");
  return { clientId: cred.client_id, clientSecret: cred.client_secret };
}

export async function youtubeAuthorizeUrl(origin: string, projectId: string): Promise<string> {
  const { clientId } = await appCredentials();
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", origin + GBP_CALLBACK_PATH);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", YOUTUBE_SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  // consent + select_account: always a refresh token, and the person picks
  // which Google account (and so which channel) to connect.
  u.searchParams.set("prompt", "consent select_account");
  u.searchParams.set("state", YOUTUBE_STATE_PREFIX + projectId);
  return u.toString();
}

type TokenResponse = { access_token: string; expires_in?: number; refresh_token?: string; error?: string; error_description?: string };

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = await appCredentials();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" }),
    cache: "no-store",
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || json.error) throw new Error(`Google sign-in failed: ${json.error_description || json.error || res.status} — reconnect the YouTube channel.`);
  return json;
}

async function ytGet<T>(token: string, path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || `YouTube API error (HTTP ${res.status})`);
  return json as T;
}

export type YouTubeChannel = { id: string; title: string; subscribers: number | null; videos: number | null };

type ChannelsResponse = {
  items?: { id: string; snippet: { title: string }; statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string } }[];
};

function toChannel(item: NonNullable<ChannelsResponse["items"]>[number]): YouTubeChannel {
  const s = item.statistics;
  return {
    id: item.id,
    title: item.snippet.title,
    subscribers: s && !s.hiddenSubscriberCount && s.subscriberCount != null ? Number(s.subscriberCount) : null,
    videos: s?.videoCount != null ? Number(s.videoCount) : null,
  };
}

/** The channel of the Google account (or Brand Account) that signed in. */
export async function myYouTubeChannel(token: string): Promise<YouTubeChannel> {
  const json = await ytGet<ChannelsResponse>(token, "channels", { part: "snippet,statistics", mine: "true" });
  const item = json.items?.[0];
  if (!item) throw new Error("This Google account has no YouTube channel. Create one at youtube.com, or pick the Brand Account that owns the channel when signing in.");
  return toChannel(item);
}

/** Saves (or refreshes, on reconnect) the project's YouTube channel. */
export async function saveYouTubeAccount(projectId: string, channel: YouTubeChannel, tokens: { access_token: string; refresh_token: string; expires_in?: number }) {
  const fields = {
    label: channel.title,
    access_token_encrypted: encryptToken(tokens.access_token),
    refresh_token_encrypted: encryptToken(tokens.refresh_token),
    token_expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
    is_active: true,
  };
  const { data: existing } = await db
    .from("client_social_accounts")
    .select("id")
    .eq("project_id", projectId)
    .eq("platform", "youtube")
    .eq("external_id", channel.id)
    .maybeSingle();
  const { error } = existing
    ? await db.from("client_social_accounts").update(fields).eq("id", existing.id)
    : await db.from("client_social_accounts").insert({ project_id: projectId, platform: "youtube", external_id: channel.id, ...fields });
  if (error) throw new Error(error.message);
}

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** A usable access token (Google's last an hour), refreshed and saved when needed. */
export async function getFreshYouTubeAccessToken(account: ClientSocialAccount): Promise<string> {
  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
  if (expiresAt - Date.now() > REFRESH_MARGIN_MS) return decryptToken(account.access_token_encrypted);
  if (!account.refresh_token_encrypted) throw new Error(`YouTube channel "${account.label}" has no refresh token saved — reconnect it.`);
  const tokens = await refreshAccessToken(decryptToken(account.refresh_token_encrypted));
  await db
    .from("client_social_accounts")
    .update({
      access_token_encrypted: encryptToken(tokens.access_token),
      token_expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
    })
    .eq("id", account.id);
  return tokens.access_token;
}

/** Subscriber count for the Connections tile — never throws. */
export async function getYouTubeChannelSummary(account: ClientSocialAccount): Promise<YouTubeChannel | null> {
  try {
    const token = await getFreshYouTubeAccessToken(account);
    const json = await ytGet<ChannelsResponse>(token, "channels", { part: "snippet,statistics", id: account.external_id });
    return json.items?.[0] ? toChannel(json.items[0]) : null;
  } catch {
    return null;
  }
}

/** YouTube titles: max 100 characters, no angle brackets. */
export function youtubeTitleFromCaption(caption: string, fallback: string): string {
  const firstLine = caption.split("\n").map((l) => l.trim()).find(Boolean) ?? fallback;
  const clean = firstLine.replace(/[<>]/g, "").replace(/\s+/g, " ").trim() || fallback;
  return clean.length > 100 ? `${clean.slice(0, 97).trimEnd()}...` : clean;
}

/**
 * Uploads a video to the channel (resumable upload, one PUT). The file is
 * streamed from its R2 download URL straight to Google, not buffered in
 * memory. A Short is a vertical video up to 3 minutes; the #Shorts tag in
 * its description helps YouTube file it as one. A thumbnail needs a
 * verified channel — if YouTube refuses it, the video still stands.
 */
export async function uploadYouTubeVideo(
  account: ClientSocialAccount,
  videoUrl: string,
  opts: { caption: string; title?: string | null; privacy?: string | null; short: boolean; thumbnailUrl?: string | null }
): Promise<{ post_id: string }> {
  const token = await getFreshYouTubeAccessToken(account);
  const source = await fetch(videoUrl, { cache: "no-store" });
  if (!source.ok || !source.body) throw new Error(`Couldn't read the video file (HTTP ${source.status}).`);
  const length = source.headers.get("content-length");
  const type = source.headers.get("content-type") || "video/mp4";

  const caption = opts.caption;
  const description = !opts.short || /#shorts\b/i.test(caption) ? caption : `${caption}${caption ? "\n\n" : ""}#Shorts`;
  const title = opts.title?.trim() ? youtubeTitleFromCaption(opts.title, account.label) : youtubeTitleFromCaption(caption, account.label);
  const privacy = opts.privacy === "unlisted" || opts.privacy === "private" ? opts.privacy : "public";
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": type,
      ...(length ? { "X-Upload-Content-Length": length } : {}),
    },
    body: JSON.stringify({
      snippet: { title, description: description.slice(0, 5000), categoryId: "22" },
      status: { privacyStatus: privacy, selfDeclaredMadeForKids: false },
    }),
    cache: "no-store",
  });
  if (!init.ok) {
    const json = await init.json().catch(() => ({}));
    throw new Error(json?.error?.message || `YouTube upload couldn't start (HTTP ${init.status}).`);
  }
  const location = init.headers.get("location");
  if (!location) throw new Error("YouTube didn't return an upload address.");

  const put = await fetch(location, {
    method: "PUT",
    headers: { "Content-Type": type, ...(length ? { "Content-Length": length } : {}) },
    body: source.body,
    // Required by Node's fetch to stream a request body.
    duplex: "half",
    cache: "no-store",
  } as RequestInit & { duplex: "half" });
  const json = await put.json().catch(() => ({}));
  if (!put.ok || !json?.id) throw new Error(json?.error?.message || `YouTube upload failed (HTTP ${put.status}).`);
  const videoId = json.id as string;

  if (opts.thumbnailUrl) {
    try {
      const img = await fetch(opts.thumbnailUrl, { cache: "no-store" });
      if (img.ok) {
        await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": img.headers.get("content-type") || "image/jpeg" },
          body: new Uint8Array(await img.arrayBuffer()),
          cache: "no-store",
        });
      }
    } catch {
      /* the video is up; a missing thumbnail isn't a failure */
    }
  }
  return { post_id: videoId };
}
