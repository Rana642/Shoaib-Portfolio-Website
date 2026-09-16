import "server-only";
import { encryptToken, decryptToken } from "./social-crypto";
import { siteUrl } from "./seo";

/**
 * Publicly-fetchable, always-JPEG image URL for Instagram's media-container
 * creation (image_url param) — Instagram's Content Publishing API rejects
 * PNG outright ("Only photo or video can be accepted as media type", hit in
 * production 2026-09-16 on a Hotel Silver Sand post), even though Facebook's
 * own /photos endpoint accepts PNG fine. Same short-lived-signed-token
 * pattern as mintTikTokMediaUrl/verifyTikTokMediaToken in social-tiktok.ts —
 * security comes from the token being unguessable, not from auth, since
 * Meta's own servers fetch this, not a logged-in user.
 */
const MEDIA_URL_TTL_MS = 15 * 60 * 1000;

function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(b64url: string): string {
  const padded = b64url.replace(/-/g, "+").replace(/_/g, "/");
  return padded + "=".repeat((4 - (padded.length % 4)) % 4);
}

export function mintInstagramMediaUrl(mediaKey: string): string {
  const token = encryptToken(JSON.stringify({ key: mediaKey, exp: Date.now() + MEDIA_URL_TTL_MS }));
  return `${siteUrl}/api/social/instagram-media/${toBase64Url(token)}.jpg`;
}

export function verifyInstagramMediaToken(token: string): string {
  const { key, exp } = JSON.parse(decryptToken(fromBase64Url(token))) as { key: string; exp: number };
  if (Date.now() > exp) throw new Error("This media link has expired.");
  return key;
}
