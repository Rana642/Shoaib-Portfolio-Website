import { NextResponse } from "next/server";
import { verifyTikTokMediaToken } from "@/lib/social-tiktok";
import { fetchObject } from "@/lib/storage";

/**
 * Publicly-fetchable image URL for TikTok's Content Posting API
 * (PULL_FROM_URL) — TikTok requires the URL's domain to be verified in the
 * Developer Portal. adsbyshoaib.com already is; R2's own bucket/gateway
 * domain isn't, so this proxies the object through here instead. No
 * dashboard auth: TikTok's own servers fetch this, not a logged-in user —
 * security instead comes from the token itself (short-lived, unguessable).
 *
 * Path-based (not `?t=...`) — a query-string version kept failing
 * photo_pull_failed even with a verified domain, correct Content-Type, and
 * an explicit Content-Length; trying a plain, extension-free path in case
 * TikTok's fetcher is picky about query strings. The token itself may still
 * contain a trailing filename-looking segment appended by the caller
 * (cosmetic only, ignored here) — see mintTikTokMediaUrl.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  // Strip a cosmetic extension (e.g. "<token>.png") if present — the token
  // itself never contains a literal dot.
  const token = rawToken.split(".")[0];

  let mediaKey: string;
  try {
    mediaKey = verifyTikTokMediaToken(token);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid token." }, { status: 403 });
  }

  try {
    const { buffer, contentType } = await fetchObject(mediaKey);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=900",
      },
    });
  } catch {
    return NextResponse.json({ error: "Media not found." }, { status: 404 });
  }
}
