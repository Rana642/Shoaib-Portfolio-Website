import { NextResponse } from "next/server";
import sharp from "sharp";
import { verifyFacebookMediaToken } from "@/lib/social-facebook-media";
import { fetchObject } from "@/lib/storage";

/**
 * Resizes/re-encodes down to a size Facebook's photo-via-URL endpoint
 * reliably accepts — same shape as tiktok-media/instagram-media, but
 * downsizing instead of format-converting: Facebook accepts PNG fine, it's
 * only large files (roughly >9-12MB) that fail with a generic
 * "Invalid parameter". 1600px on the long side + JPEG q85 comfortably clears
 * that for any source size without visibly degrading a social post image.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  const token = rawToken.split(".")[0];

  let mediaKey: string;
  try {
    mediaKey = verifyFacebookMediaToken(token);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid token." }, { status: 403 });
  }

  try {
    const { buffer } = await fetchObject(mediaKey);
    const jpeg = await sharp(buffer)
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85 })
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
