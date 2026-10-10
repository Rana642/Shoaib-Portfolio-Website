import { db } from "@/lib/dashboard/db";
import { verifyPostImageLink } from "@/lib/post-image-links";
import { isStorageConfigured, streamObject } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Short-lived, signature-gated download of a Planner post's original file
 * (`/api/social/post-image/<name>?p=<postId>&e=<expiry>&sig=<hmac>[&dl=1]`).
 * Links are minted only by the social_get_post_image_url MCP tool
 * (lib/post-image-links.ts) and expire after 15 minutes. The storage key is
 * looked up here, server-side — it never appears in the link. Streamed, so
 * large originals aren't cut off by the serverless response limit.
 */
const HEADERS = { "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const check = verifyPostImageLink(url.searchParams.get("p"), url.searchParams.get("e"), url.searchParams.get("sig"));
  if ("error" in check) return new Response(check.error, { status: 403, headers: HEADERS });
  if (!isStorageConfigured) return new Response("Storage is not configured.", { status: 503, headers: HEADERS });

  const { data: post } = await db.from("scheduled_posts").select("media_key, original_filename").eq("id", check.postId).maybeSingle();
  if (!post?.media_key) return new Response("Post or image not found.", { status: 404, headers: HEADERS });

  try {
    const file = await streamObject(post.media_key as string);
    const name = String(post.original_filename ?? "post-image").replace(/["\r\n]/g, "");
    return new Response(file.body, {
      headers: {
        ...HEADERS,
        "Content-Type": file.contentType,
        ...(file.size !== null ? { "Content-Length": String(file.size) } : {}),
        "Content-Disposition": `${url.searchParams.get("dl") ? "attachment" : "inline"}; filename="${name}"`,
      },
    });
  } catch {
    return new Response("Image missing from storage.", { status: 404, headers: HEADERS });
  }
}
