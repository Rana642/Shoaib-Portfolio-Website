import "server-only";
import { db } from "./dashboard/db";
import { decryptAccountToken, listSocialAccountsForProject } from "./social-accounts";
import { publishedImageUrl } from "./social-fb";
import { IG_LOGIN_GRAPH_BASE, getFreshInstagramLoginToken, isInstagramLoginAccount } from "./social-instagram-login";
import type { PlatformPostResult } from "./social-post";
import { headObject, uploadObject } from "./storage";

/**
 * A post's upload is deleted from storage once every platform confirms it
 * (app/api/social/cron). A later row that reuses the same media_key — e.g.
 * the LinkedIn copies of already-published posts made on 2026-10-28 — then
 * has nothing to send (a 404 on the presigned URL). Before such a row goes
 * out, the image is taken back from the published Instagram copy (else
 * Facebook) of the row that already posted it, and put back under the same
 * key. The same recovery lib/gbp-backfill.ts uses for Google.
 */

type Row = { id: string; project_id: string; media_key: string };

/** True when the image is (now) in storage. */
export async function restorePublishedMedia(post: Row): Promise<boolean> {
  if (await headObject(post.media_key)) return true;

  const { data: siblings } = await db
    .from("scheduled_posts")
    .select("id, result")
    .eq("media_key", post.media_key)
    .eq("status", "posted")
    .neq("id", post.id)
    .limit(5);
  if (!siblings?.length) return false;

  const accounts = await listSocialAccountsForProject(post.project_id);
  for (const sibling of siblings) {
    const r = (sibling.result ?? {}) as { platforms?: PlatformPostResult[]; native?: PlatformPostResult[]; live?: PlatformPostResult[] };
    const done = [...(r.platforms ?? []), ...(r.native ?? []), ...(r.live ?? [])].filter((p) => p.ok && p.post_id);
    for (const platform of ["instagram", "facebook"] as const) {
      const posted = done.find((p) => p.platform === platform);
      const account = posted && accounts.find((a) => a.platform === platform && a.external_id === posted.external_id);
      if (!posted?.post_id || !account) continue;
      try {
        const url = isInstagramLoginAccount(account)
          ? await publishedImageUrl(platform, posted.post_id, await getFreshInstagramLoginToken(account), IG_LOGIN_GRAPH_BASE)
          : await publishedImageUrl(platform, posted.post_id, decryptAccountToken(account));
        if (!url) continue;
        const res = await fetch(url);
        if (!res.ok) continue;
        await uploadObject(post.media_key, Buffer.from(await res.arrayBuffer()), res.headers.get("content-type") || "image/jpeg");
        return true;
      } catch {
        /* try the next platform / sibling */
      }
    }
  }
  return false;
}
