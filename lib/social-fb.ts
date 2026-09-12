import "server-only";

/**
 * Meta Graph API helpers. Shoaib is an admin on every client's Facebook
 * Page himself, so this discovers Pages via his own login rather than doing
 * per-client OAuth — see the note in supabase/dashboard-schema.sql.
 */

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

type GraphError = { error?: { message?: string; type?: string; code?: number } };

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const body = (await res.json()) as T & GraphError;
  if (!res.ok || body.error) {
    throw new Error(body.error?.message || `Graph API error (HTTP ${res.status})`);
  }
  return body;
}

/** Exchanges a short-lived User Access Token (from Graph API Explorer) for a
 *  long-lived one (~60 days) — required before deriving Page tokens that
 *  themselves become effectively permanent. */
export async function exchangeForLongLivedUserToken(
  shortLivedToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const appId = process.env.META_APP_ID || "";
  const appSecret = process.env.META_APP_SECRET || "";
  if (!appId || !appSecret) {
    throw new Error("META_APP_ID / META_APP_SECRET are not configured in .env.local.");
  }
  return graphGet("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });
}

export type DiscoveredPage = {
  page_id: string;
  name: string;
  /** Page Access Token derived from a long-lived User token — doesn't expire
   *  on its own as long as the User token that produced it stays valid. */
  page_access_token: string;
  instagram_business_account_id: string | null;
};

/** Lists every Facebook Page the given User token's owner administers,
 *  including each Page's linked Instagram Business Account (if any). */
export async function listManagedPages(longLivedUserToken: string): Promise<DiscoveredPage[]> {
  const { data } = await graphGet<{
    data: { id: string; name: string; access_token: string; instagram_business_account?: { id: string } }[];
  }>("/me/accounts", {
    fields: "id,name,access_token,instagram_business_account",
    access_token: longLivedUserToken,
    limit: "100",
  });

  return data.map((p) => ({
    page_id: p.id,
    name: p.name,
    page_access_token: p.access_token,
    instagram_business_account_id: p.instagram_business_account?.id ?? null,
  }));
}

/** Posts a photo (with caption) to a Facebook Page's feed. */
export async function postFacebookPhoto(
  pageId: string,
  pageAccessToken: string,
  imageUrl: string,
  caption: string
): Promise<{ post_id: string }> {
  const url = `${GRAPH_BASE}/${pageId}/photos`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ url: imageUrl, caption, access_token: pageAccessToken }),
  });
  const body = (await res.json()) as { id?: string; post_id?: string } & GraphError;
  if (!res.ok || body.error) throw new Error(body.error?.message || `Facebook post failed (HTTP ${res.status})`);
  return { post_id: body.post_id || body.id || "" };
}

/** Two-step Instagram publish: create a media container, then publish it.
 *  Requires the IG account to be a Business/Creator account linked to a
 *  Facebook Page — Meta does not allow API posting to a standalone account. */
export async function postInstagramPhoto(
  igUserId: string,
  pageAccessToken: string,
  imageUrl: string,
  caption: string
): Promise<{ post_id: string }> {
  const createRes = await fetch(`${GRAPH_BASE}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ image_url: imageUrl, caption, access_token: pageAccessToken }),
  });
  const created = (await createRes.json()) as { id?: string } & GraphError;
  if (!createRes.ok || created.error || !created.id) {
    throw new Error(created.error?.message || "Instagram media container creation failed");
  }

  const publishRes = await fetch(`${GRAPH_BASE}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: created.id, access_token: pageAccessToken }),
  });
  const published = (await publishRes.json()) as { id?: string } & GraphError;
  if (!publishRes.ok || published.error) {
    throw new Error(published.error?.message || "Instagram publish failed");
  }
  return { post_id: published.id || "" };
}
