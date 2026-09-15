import { NextResponse } from "next/server";
import sharp from "sharp";
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
 * an explicit Content-Length; a plain path with an extension fixed that.
 *
 * Always re-encodes to JPEG regardless of the source format: TikTok's photo
 * post rejects PNG outright (file_format_check_failed) — the Planner accepts
 * png/jpg/webp uniformly since Meta/LinkedIn don't care, so normalizing here
 * is simpler than tracking per-platform format support upstream. See
 * mintTikTokMediaUrl, which always mints a `.jpg` URL to match.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  // Strip the cosmetic ".jpg" extension (e.g. "<token>.jpg") — the token
  // itself never contains a literal dot.
  const token = rawToken.split(".")[0];

  let mediaKey: string;
  try {
    mediaKey = verifyTikTokMediaToken(token);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid token." }, { status: 403 });
  }

  try {
    const { buffer } = await fetchObject(mediaKey);
    // TikTok's photo post wants a 9:16 canvas (1080x1920) — a source image
    // of some other shape gets letterboxed onto one rather than cropped, so
    // nothing in the original photo is lost.
    const jpeg = await sharp(buffer)
      .resize(1080, 1920, { fit: "contain", background: "#ffffff" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 90 })
      .toBuffer();
    return new NextResponse(new Uint8Array(jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(jpeg.length),
        "Cache-Control": "private, max-age=900",
      },
    });
  } catch {
    return NextResponse.json({ error: "Media not found." }, { status: 404 });
  }
}
