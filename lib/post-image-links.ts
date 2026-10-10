import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived links to a Planner post's original image, for MCP tools that
 * need to hand the user a file they can open or download. The link carries
 * only the post id + an expiry, signed with MCP_OAUTH_SIGNING_KEY under its
 * own purpose prefix — never the storage path, and never a permanent or
 * public URL. /api/social/post-image/[name] checks the signature and expiry
 * and streams the file from private storage.
 */
const SITE = "https://adsbyshoaib.com";
const DOMAIN = "post-image";
export const POST_IMAGE_LINK_TTL_SECONDS = 15 * 60;

function secret(): string {
  const s = process.env.MCP_OAUTH_SIGNING_KEY || "";
  if (!s) throw new Error("MCP_OAUTH_SIGNING_KEY is not configured.");
  return s;
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(`${DOMAIN}:${data}`).digest("base64url");
}

/** e.g. "17.png" → "17.png"; anything odd → "post-image". */
function safeName(filename: string) {
  return filename.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "post-image";
}

export function postImageLink(postId: string, filename: string, now = Date.now()) {
  const exp = Math.floor(now / 1000) + POST_IMAGE_LINK_TTL_SECONDS;
  const data = `${postId}.${exp}`;
  const base = `${SITE}/api/social/post-image/${encodeURIComponent(safeName(filename))}?p=${postId}&e=${exp}&sig=${sign(data)}`;
  return { view: base, download: `${base}&dl=1`, expiresAt: new Date(exp * 1000).toISOString() };
}

/** The post id if the link is genuine and not expired, else a reason. */
export function verifyPostImageLink(p: string | null, e: string | null, sig: string | null, now = Date.now()): { postId: string } | { error: string } {
  if (!p || !e || !sig) return { error: "Missing link parameters." };
  if (!/^[0-9a-f-]{36}$/i.test(p) || !/^\d{9,12}$/.test(e)) return { error: "Malformed link." };
  const expected = Buffer.from(sign(`${p}.${e}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { error: "Invalid link." };
  if (Number(e) * 1000 < now) return { error: "This link has expired — ask for a new one." };
  return { postId: p };
}
