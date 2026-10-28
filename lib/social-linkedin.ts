import "server-only";
import { getVaultCredential } from "./marketing-vault";

/**
 * LinkedIn Company Pages through the Community Management API, on the
 * "Ads by Shoaib" LinkedIn app (client id/secret in the API Vault as service
 * "linkedin_company"). LinkedIn requires that product to be alone on its
 * app, so Shoaib's personal profile posts through a second app instead
 * (lib/social-linkedin-personal.ts).
 *
 * Shoaib connects his own LinkedIn login once (OAuth, scopes below); the
 * Company Pages he administers are discovered from it and imported onto
 * projects. LinkedIn has no per-Page token like Meta: every org row stores
 * the same member token, and the member's ADMINISTRATOR role on the Page is
 * what lets it post. Member tokens last 60 days, then the login is
 * connected again (refresh tokens are for approved partners only).
 *
 * Versioned REST API (api.linkedin.com/rest): every call carries
 * LinkedIn-Version (YYYYMM) and X-Restli-Protocol-Version 2.0.0. Versions
 * are supported for about a year, so bump LINKEDIN_VERSION from time to
 * time (the docs list the live ones).
 */

export const LINKEDIN_VERSION = "202610";
export const LINKEDIN_COMPANY_SCOPES = "rw_organization_admin w_organization_social r_organization_social";
export const LINKEDIN_COMPANY_CALLBACK = "/api/social/linkedin-callback";

const REST_BASE = "https://api.linkedin.com/rest";
const V2_BASE = "https://api.linkedin.com/v2";

async function restFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${REST_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LinkedIn API error (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  return res;
}

async function v2Fetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${V2_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LinkedIn API error (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  return res;
}

// ── OAuth (the "Ads by Shoaib" Community Management app) ─────────

async function companyAppCredentials() {
  const cred = await getVaultCredential("linkedin_company").catch(() => ({}) as Record<string, string>);
  if (!cred.client_id || !cred.client_secret) {
    throw new Error("Add the LinkedIn app's client_id and client_secret to the API Vault as service 'linkedin_company'.");
  }
  return { clientId: cred.client_id.trim(), clientSecret: cred.client_secret.trim() };
}

export async function linkedinCompanyAuthorizeUrl(origin: string, state: string): Promise<string> {
  const { clientId } = await companyAppCredentials();
  const u = new URL("https://www.linkedin.com/oauth/v2/authorization");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", origin + LINKEDIN_COMPANY_CALLBACK);
  u.searchParams.set("scope", LINKEDIN_COMPANY_SCOPES);
  u.searchParams.set("state", state);
  return u.toString();
}

/** Code → member access token (60 days). */
export async function exchangeLinkedInCompanyCode(code: string, origin: string): Promise<{ accessToken: string; expiresIn: number | null }> {
  const { clientId, clientSecret } = await companyAppCredentials();
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, client_secret: clientSecret, redirect_uri: origin + LINKEDIN_COMPANY_CALLBACK }),
    cache: "no-store",
  });
  const tok = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!res.ok || !tok.access_token) throw new Error(`LinkedIn sign-in failed: ${tok.error_description || tok.error || res.status}`);
  return { accessToken: tok.access_token, expiresIn: tok.expires_in ?? null };
}

// ── Company Pages the member administers ──────────────────────────

export type DiscoveredOrganization = {
  organization_urn: string;
  name: string;
};

/** Lists Company Pages the token's owner administers — same idea as Meta's
 *  /me/accounts. Names come from the Organization Lookup API in ONE batch
 *  call: twenty parallel single lookups got throttled (2026-10-28) and the
 *  dialog showed bare URNs. A Page whose name still can't be read keeps its
 *  URN here; callers fill in names they already know. */
export async function listManagedOrganizations(token: string): Promise<DiscoveredOrganization[]> {
  const urns: string[] = [];
  for (let start = 0; start < 500; start += 100) {
    const res = await restFetch(`/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100&start=${start}`, token);
    const body = (await res.json()) as { elements?: { organization?: string; organizationTarget?: string }[] };
    const page = (body.elements ?? []).map((el) => el.organization ?? el.organizationTarget).filter((u): u is string => Boolean(u));
    urns.push(...page);
    if (page.length < 100) break;
  }
  const unique = [...new Set(urns)].filter((u) => u.startsWith("urn:li:organization:"));
  const names = new Map<string, string>();
  for (let i = 0; i < unique.length; i += 50) {
    const ids = unique.slice(i, i + 50).map((u) => u.split(":").pop()!);
    try {
      const res = await restFetch(`/organizations?ids=List(${ids.join(",")})`, token, { headers: { "X-RestLi-Method": "BATCH_GET" } });
      const body = (await res.json()) as { results?: Record<string, { localizedName?: string }> };
      for (const [id, org] of Object.entries(body.results ?? {})) if (org.localizedName) names.set(`urn:li:organization:${id}`, org.localizedName);
    } catch (error) {
      console.error("[linkedin] organization names lookup failed:", error instanceof Error ? error.message : error);
    }
  }
  return unique.map((urn) => ({ organization_urn: urn, name: names.get(urn) ?? urn }));
}

// ── Posting ───────────────────────────────────────────────────────

/** Post commentary is in LinkedIn's "little" format: these characters are
 *  reserved and must be backslash-escaped, or the text after them can be
 *  dropped. "#word" stays as is — that's how a hashtag is written. */
export function toLittleText(text: string): string {
  return text.replace(/[\\|{}@[\]()<>*_~]/g, (c) => `\\${c}`).replace(/#(?![\p{L}\p{N}_])/gu, "\\#");
}

/** authorUrn: "urn:li:organization:xxxx" (a Company Page, Posts API) or
 *  "urn:li:person:xxxx" (a personal profile on the Share on LinkedIn app,
 *  which still uses the v2 ugcPosts flow it was connected with). */
export async function postLinkedInPhoto(
  authorUrn: string,
  token: string,
  imageUrl: string,
  caption: string
): Promise<{ post_id: string }> {
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) throw new Error(`Could not fetch image for LinkedIn upload (HTTP ${imageRes.status})`);
  const imageBytes = await imageRes.arrayBuffer();
  return authorUrn.startsWith("urn:li:organization:")
    ? postOrganizationImage(authorUrn, token, imageBytes, caption)
    : postMemberImageV2(authorUrn, token, imageBytes, caption);
}

async function postOrganizationImage(orgUrn: string, token: string, imageBytes: ArrayBuffer, caption: string) {
  // 1. Register the upload.
  const init = await restFetch("/images?action=initializeUpload", token, {
    method: "POST",
    body: JSON.stringify({ initializeUploadRequest: { owner: orgUrn } }),
  });
  const { value } = (await init.json()) as { value: { uploadUrl: string; image: string } };

  // 2. PUT the bytes to the one-time upload URL.
  const put = await fetch(value.uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: imageBytes });
  if (!put.ok) throw new Error(`LinkedIn image upload failed (HTTP ${put.status})`);

  // 3. Give LinkedIn a moment to process it; a post on a still-processing
  //    image can fail. Post anyway after a few tries — it usually takes.
  for (let i = 0; i < 4; i++) {
    const res = await restFetch(`/images/${encodeURIComponent(value.image)}`, token).catch(() => null);
    const status = res ? ((await res.json()) as { status?: string }).status : undefined;
    if (status === "AVAILABLE") break;
    if (status === "PROCESSING_FAILED") throw new Error("LinkedIn couldn't process the image.");
    await new Promise((r) => setTimeout(r, 1500));
  }

  // 4. The post itself.
  const res = await restFetch("/posts", token, {
    method: "POST",
    body: JSON.stringify({
      author: orgUrn,
      commentary: toLittleText(caption),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { id: value.image } },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  return { post_id: res.headers.get("x-restli-id") || "" };
}

async function postMemberImageV2(authorUrn: string, token: string, imageBytes: ArrayBuffer, caption: string) {
  const registerRes = await v2Fetch("/assets?action=registerUpload", token, {
    method: "POST",
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        owner: authorUrn,
        serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }],
      },
    }),
  });
  const registerBody = (await registerRes.json()) as {
    value: { asset: string; uploadMechanism: { "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": { uploadUrl: string } } };
  };
  const asset = registerBody.value.asset;
  const uploadUrl = registerBody.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"].uploadUrl;
  const putRes = await fetch(uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: imageBytes });
  if (!putRes.ok) throw new Error(`LinkedIn image upload failed (HTTP ${putRes.status})`);

  const postRes = await v2Fetch("/ugcPosts", token, {
    method: "POST",
    body: JSON.stringify({
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: caption },
          shareMediaCategory: "IMAGE",
          media: [{ status: "READY", media: asset }],
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    }),
  });
  return { post_id: postRes.headers.get("x-restli-id") || "" };
}

// ── Page analytics ────────────────────────────────────────────────

export type LinkedInShareStats = {
  impressions: number;
  uniqueImpressions: number;
  clicks: number;
  likes: number;
  comments: number;
  shares: number;
  /** (clicks + likes + comments + shares) / impressions, as LinkedIn reports it. */
  engagement: number;
};

type RawShareStats = {
  impressionCount?: number;
  uniqueImpressionsCount?: number;
  clickCount?: number;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  engagement?: number;
};

const toStats = (s: RawShareStats | undefined): LinkedInShareStats => ({
  impressions: s?.impressionCount ?? 0,
  uniqueImpressions: s?.uniqueImpressionsCount ?? 0,
  clicks: s?.clickCount ?? 0,
  likes: s?.likeCount ?? 0,
  comments: s?.commentCount ?? 0,
  shares: s?.shareCount ?? 0,
  engagement: s?.engagement ?? 0,
});

/** Organic totals for the Page between two dates (LinkedIn keeps 12 months). */
export async function getOrganizationShareTotals(orgUrn: string, token: string, startMs: number, endMs: number): Promise<LinkedInShareStats> {
  const q =
    `/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(orgUrn)}` +
    `&timeIntervals=(timeRange:(start:${startMs},end:${endMs}),timeGranularityType:DAY)`;
  const res = await restFetch(q, token);
  const body = (await res.json()) as { elements?: { totalShareStatistics?: RawShareStats }[] };
  const sum = toStats(undefined);
  for (const el of body.elements ?? []) {
    const s = toStats(el.totalShareStatistics);
    sum.impressions += s.impressions;
    sum.uniqueImpressions += s.uniqueImpressions;
    sum.clicks += s.clicks;
    sum.likes += s.likes;
    sum.comments += s.comments;
    sum.shares += s.shares;
  }
  sum.engagement = sum.impressions ? (sum.clicks + sum.likes + sum.comments + sum.shares) / sum.impressions : 0;
  return sum;
}

/** Lifetime stats per post (share or ugcPost URNs). Posts LinkedIn leaves
 *  out had no activity at all, so they come back as zeros. */
export async function getPostShareStats(orgUrn: string, token: string, postUrns: string[]): Promise<Record<string, LinkedInShareStats>> {
  const out: Record<string, LinkedInShareStats> = Object.fromEntries(postUrns.map((u) => [u, toStats(undefined)]));
  const shares = postUrns.filter((u) => u.startsWith("urn:li:share:"));
  const ugc = postUrns.filter((u) => u.startsWith("urn:li:ugcPost:"));
  if (!shares.length && !ugc.length) return out;
  let q = `/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(orgUrn)}`;
  if (shares.length) q += `&shares=List(${shares.map(encodeURIComponent).join(",")})`;
  if (ugc.length) q += `&ugcPosts=List(${ugc.map(encodeURIComponent).join(",")})`;
  const res = await restFetch(q, token);
  const body = (await res.json()) as { elements?: { share?: string; ugcPost?: string; totalShareStatistics?: RawShareStats }[] };
  for (const el of body.elements ?? []) {
    const urn = el.share ?? el.ugcPost;
    if (urn) out[urn] = toStats(el.totalShareStatistics);
  }
  return out;
}

export type LinkedInPost = { id: string; text: string; publishedAt: number | null; imageUrn: string | null };

/** The Page's latest posts, newest first. */
export async function listOrganizationPosts(orgUrn: string, token: string, count = 20): Promise<LinkedInPost[]> {
  const res = await restFetch(`/posts?author=${encodeURIComponent(orgUrn)}&q=author&count=${count}&sortBy=CREATED`, token, {
    headers: { "X-RestLi-Method": "FINDER" },
  });
  const body = (await res.json()) as {
    elements?: { id: string; commentary?: string; publishedAt?: number; createdAt?: number; content?: { media?: { id?: string } } }[];
  };
  return (body.elements ?? []).map((p) => ({
    id: p.id,
    text: p.commentary ?? "",
    publishedAt: p.publishedAt ?? p.createdAt ?? null,
    imageUrn: p.content?.media?.id?.startsWith("urn:li:image:") ? p.content.media.id : null,
  }));
}

/** The Page's full profile as LinkedIn's Organization Lookup API returns it
 *  (name, vanity name, description, tagline, website, industries, size,
 *  locations, specialties, logo/cover assets…). Public Page data. */
export async function getOrganizationProfile(orgUrn: string, token: string): Promise<Record<string, unknown>> {
  const res = await restFetch(`/organizations/${orgUrn.split(":").pop()}`, token);
  return (await res.json()) as Record<string, unknown>;
}

/** Lifetime organic totals for the Page (no time range). */
export async function getOrganizationLifetimeStats(orgUrn: string, token: string): Promise<LinkedInShareStats> {
  const res = await restFetch(
    `/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(orgUrn)}`,
    token
  );
  const body = (await res.json()) as { elements?: { totalShareStatistics?: RawShareStats }[] };
  return toStats(body.elements?.[0]?.totalShareStatistics);
}

/** Who follows the Page: lifetime follower counts by country, industry,
 *  seniority, job function and company size (top entries of each, as URNs). */
export async function getFollowerBreakdown(orgUrn: string, token: string): Promise<Record<string, { key: string; followers: number }[]>> {
  const res = await restFetch(
    `/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(orgUrn)}`,
    token
  );
  const body = (await res.json()) as { elements?: Record<string, unknown>[] };
  const el = body.elements?.[0] ?? {};
  const out: Record<string, { key: string; followers: number }[]> = {};
  for (const [field, value] of Object.entries(el)) {
    if (!field.startsWith("followerCountsBy") || !Array.isArray(value)) continue;
    out[field.replace("followerCountsBy", "")] = (value as Record<string, unknown>[])
      .map((row) => {
        const counts = (row.followerCounts ?? {}) as { organicFollowerCount?: number; paidFollowerCount?: number };
        const keyField = Object.keys(row).find((k) => k !== "followerCounts");
        return { key: String(keyField ? row[keyField] : "?"), followers: (counts.organicFollowerCount ?? 0) + (counts.paidFollowerCount ?? 0) };
      })
      .sort((a, b) => b.followers - a.followers)
      .slice(0, 8);
  }
  return out;
}

/** Viewable URLs for uploaded images (they expire, so fetch per page view). */
export async function getImageUrls(token: string, imageUrns: string[]): Promise<Record<string, string>> {
  if (!imageUrns.length) return {};
  try {
    const res = await restFetch(`/images?ids=List(${imageUrns.map(encodeURIComponent).join(",")})`, token, {
      headers: { "X-RestLi-Method": "BATCH_GET" },
    });
    const body = (await res.json()) as { results?: Record<string, { downloadUrl?: string }> };
    return Object.fromEntries(
      Object.entries(body.results ?? {})
        .filter(([, v]) => v.downloadUrl)
        .map(([k, v]) => [k, v.downloadUrl!])
    );
  } catch {
    return {};
  }
}

/** Follower count of the Page; null when LinkedIn won't say. */
export async function getOrganizationFollowers(orgUrn: string, token: string): Promise<number | null> {
  try {
    const res = await restFetch(`/networkSizes/${encodeURIComponent(orgUrn)}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`, token);
    const body = (await res.json()) as { firstDegreeSize?: number };
    return typeof body.firstDegreeSize === "number" ? body.firstDegreeSize : null;
  } catch {
    return null;
  }
}
