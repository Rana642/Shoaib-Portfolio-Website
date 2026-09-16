import { NextResponse } from "next/server";
import sharp from "sharp";
import { verifyInstagramMediaToken } from "@/lib/social-instagram-media";
import { fetchObject } from "@/lib/storage";

/**
 * Always re-encodes to JPEG regardless of source format — Instagram's media
 * container creation rejects PNG outright, unlike Facebook's /photos
 * endpoint. Same shape as app/api/social/tiktok-media/[token]/route.ts, but
 * no resize/letterbox: Instagram auto-crops out-of-range aspect ratios
 * itself, it just can't be handed a PNG at all.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  const token = rawToken.split(".")[0];

  let mediaKey: string;
  try {
    mediaKey = verifyInstagramMediaToken(token);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid token." }, { status: 403 });
  }

  try {
    const { buffer } = await fetchObject(mediaKey);
    const jpeg = await sharp(buffer)
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
