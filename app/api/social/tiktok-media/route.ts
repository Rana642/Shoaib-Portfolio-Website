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
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t");
  if (!token) return NextResponse.json({ error: "Missing token." }, { status: 400 });

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
