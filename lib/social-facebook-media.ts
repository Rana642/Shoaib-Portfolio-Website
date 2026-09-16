import "server-only";
import { encryptToken, decryptToken } from "./social-crypto";
import { siteUrl } from "./seo";

/**
 * Publicly-fetchable, size-safe image URL for Facebook's photo-via-URL
 * endpoints (/photos, both immediate and native-scheduled) — Meta rejects
 * large images with a generic "Invalid parameter" past an undocumented
 * threshold somewhere around 9-12MB (first hit and worked around manually
 * for Hotel Elegant, then hit again for real on Hotel Silver Sand's 13.png
 * batch, 2026-09-16 — this makes the fix permanent instead of a one-off).
 * Same short-lived-signed-token pattern as social-tiktok.ts/
 * social-instagram-media.ts.
 */
const MEDIA_URL_TTL_MS = 15 * 60 * 1000;

function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(b64url: string): string {
  const padded = b64url.replace(/-/g, "+").replace(/_/g, "/");
  return padded + "=".repeat((4 - (padded.length % 4)) % 4);
}

export function mintFacebookMediaUrl(mediaKey: string): string {
  const token = encryptToken(JSON.stringify({ key: mediaKey, exp: Date.now() + MEDIA_URL_TTL_MS }));
  return `${siteUrl}/api/social/facebook-media/${toBase64Url(token)}.jpg`;
}

export function verifyFacebookMediaToken(token: string): string {
  const { key, exp } = JSON.parse(decryptToken(fromBase64Url(token))) as { key: string; exp: number };
  if (Date.now() > exp) throw new Error("This media link has expired.");
  return key;
}
