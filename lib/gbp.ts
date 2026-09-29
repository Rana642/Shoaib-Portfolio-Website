import "server-only";
import { db } from "./dashboard/db";
import { getVaultCredential } from "./marketing-vault";
import { decryptToken, encryptToken } from "./social-crypto";

/**
 * Google Business Profile, per client project. The OAuth client lives in
 * the "Socially Snap" Google Cloud project (875327223530) — that's the one
 * Google allowlisted for the GBP API (300 QPM, approved 2026-09-29), so its
 * consent screen shows "Socially Snap". Its client_id / client_secret sit in
 * the API Vault as service "gmb". Each project's own grant (a refresh
 * token) is stored AES-256-GCM encrypted in gbp_connections, the same way
 * Meta Ads connections are.
 */

export const GBP_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/business.manage"];
export const GBP_CALLBACK_PATH = "/api/gbp/callback";

export type GbpLocation = {
  /** "accounts/123" — the v4 reviews API needs the account in the path. */
  account: string;
  /** "locations/456" */
  name: string;
  title: string;
  address: string | null;
};

export type GbpConnection = {
  id: string;
  project_id: string;
  connected_email: string | null;
  locations: GbpLocation[];
  selected_location: string | null;
  connected_at: string;
};

export type GbpReview = {
  reviewId: string;
  name: string;
  reviewer: { displayName?: string; profilePhotoUrl?: string; isAnonymous?: boolean };
  starRating: "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE" | "STAR_RATING_UNSPECIFIED";
  comment?: string;
  createTime: string;
  updateTime: string;
  reviewReply?: { comment: string; updateTime: string };
};

export const STARS: Record<GbpReview["starRating"], number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, STAR_RATING_UNSPECIFIED: 0 };

async function appCredentials() {
  const cred = await getVaultCredential("gmb");
  if (!cred.client_id || !cred.client_secret) throw new Error("The 'gmb' credential in the API Vault needs client_id and client_secret (Socially Snap OAuth client).");
  return { clientId: cred.client_id, clientSecret: cred.client_secret };
}

export async function authorizeUrl(origin: string, projectId: string): Promise<string> {
  const { clientId } = await appCredentials();
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", origin + GBP_CALLBACK_PATH);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", GBP_SCOPES.join(" "));
  // offline + consent: always hand back a refresh token, even on a reconnect.
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", projectId);
  return u.toString();
}

type TokenResponse = { access_token: string; refresh_token?: string; id_token?: string; error?: string; error_description?: string };

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    cache: "no-store",
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || json.error) throw new Error(`Google sign-in failed: ${json.error_description || json.error || res.status}`);
  return json;
}

export async function exchangeCode(code: string, origin: string) {
  const { clientId, clientSecret } = await appCredentials();
  return tokenRequest({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: origin + GBP_CALLBACK_PATH, grant_type: "authorization_code" });
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = await appCredentials();
  const json = await tokenRequest({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" });
  return json.access_token;
}

/** The email on the id_token (signed by Google, received straight from its
 *  token endpoint over TLS — only used as a display label). */
export function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

async function gapi<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(json?.error?.message || `Google Business Profile API error (HTTP ${res.status})`);
  return json as T;
}

/** Every account the person can manage, and every location in them. */
export async function discoverLocations(token: string): Promise<GbpLocation[]> {
  const accounts: { name: string }[] = [];
  let pageToken = "";
  do {
    const u = new URL("https://mybusinessaccountmanagement.googleapis.com/v1/accounts");
    u.searchParams.set("pageSize", "20");
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    const res = await gapi<{ accounts?: { name: string }[]; nextPageToken?: string }>(token, u.toString());
    accounts.push(...(res.accounts ?? []));
    pageToken = res.nextPageToken ?? "";
  } while (pageToken);

  const locations: GbpLocation[] = [];
  for (const account of accounts) {
    let lp = "";
    do {
      const u = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations`);
      u.searchParams.set("readMask", "name,title,storefrontAddress");
      u.searchParams.set("pageSize", "100");
      if (lp) u.searchParams.set("pageToken", lp);
      const res = await gapi<{
        locations?: { name: string; title?: string; storefrontAddress?: { addressLines?: string[]; locality?: string } }[];
        nextPageToken?: string;
      }>(token, u.toString());
      for (const l of res.locations ?? []) {
        const a = l.storefrontAddress;
        const address = a ? [...(a.addressLines ?? []), a.locality].filter(Boolean).join(", ") || null : null;
        locations.push({ account: account.name, name: l.name, title: l.title ?? l.name, address });
      }
      lp = res.nextPageToken ?? "";
    } while (lp);
  }
  return locations;
}

export async function saveConnection(projectId: string, refreshToken: string, email: string | null, locations: GbpLocation[], projectName?: string) {
  const { data: existing } = await db.from("gbp_connections").select("selected_location").eq("project_id", projectId).maybeSingle();
  const keep = existing?.selected_location && locations.some((l) => l.name === existing.selected_location);
  const { error } = await db.from("gbp_connections").upsert(
    {
      project_id: projectId,
      refresh_token_enc: encryptToken(refreshToken),
      connected_email: email,
      locations,
      selected_location: keep ? existing!.selected_location : locations.length === 1 ? locations[0].name : (projectName ? matchLocation(locations, projectName)?.name ?? null : null),
      connected_at: new Date().toISOString(),
    },
    { onConflict: "project_id" }
  );
  if (error) throw new Error(error.message);
}

export async function getGbpConnection(projectId: string): Promise<GbpConnection | null> {
  const { data } = await db
    .from("gbp_connections")
    .select("id, project_id, connected_email, locations, selected_location, connected_at")
    .eq("project_id", projectId)
    .maybeSingle();
  return (data as GbpConnection | null) ?? null;
}

export async function gbpAccessToken(projectId: string): Promise<string> {
  const { data } = await db.from("gbp_connections").select("refresh_token_enc").eq("project_id", projectId).maybeSingle();
  if (!data?.refresh_token_enc) throw new Error("This project isn't connected to Google Business Profile.");
  return refreshAccessToken(decryptToken(data.refresh_token_enc as string));
}

/** One location of a connected project, checked against what was granted. */
export function findLocation(conn: GbpConnection, locationName?: string | null): GbpLocation | null {
  const want = locationName ?? conn.selected_location;
  return conn.locations.find((l) => l.name === want) ?? null;
}

const v4 = (loc: GbpLocation) => `https://mybusiness.googleapis.com/v4/${loc.account}/${loc.name}`;

export async function listReviews(token: string, loc: GbpLocation, pageToken?: string) {
  const u = new URL(`${v4(loc)}/reviews`);
  u.searchParams.set("pageSize", "50");
  u.searchParams.set("orderBy", "updateTime desc");
  if (pageToken) u.searchParams.set("pageToken", pageToken);
  const res = await gapi<{ reviews?: GbpReview[]; averageRating?: number; totalReviewCount?: number; nextPageToken?: string }>(token, u.toString());
  return { reviews: res.reviews ?? [], averageRating: res.averageRating ?? null, total: res.totalReviewCount ?? 0, nextPageToken: res.nextPageToken ?? null };
}

const REVIEW_ID = /^[A-Za-z0-9_-]{1,200}$/;

export async function replyToReview(token: string, loc: GbpLocation, reviewId: string, comment: string) {
  if (!REVIEW_ID.test(reviewId)) throw new Error("Invalid review id.");
  const text = comment.trim();
  if (!text || text.length > 4096) throw new Error("A reply needs 1–4096 characters.");
  return gapi<{ comment: string; updateTime: string }>(token, `${v4(loc)}/reviews/${reviewId}/reply`, { method: "PUT", body: JSON.stringify({ comment: text }) });
}

export async function deleteReviewReply(token: string, loc: GbpLocation, reviewId: string) {
  if (!REVIEW_ID.test(reviewId)) throw new Error("Invalid review id.");
  await gapi(token, `${v4(loc)}/reviews/${reviewId}/reply`, { method: "DELETE" });
}

// ── Reusing one Google grant across projects ──────────────────────────
// Shoaib's own Google account manages every client's Business Profile, so
// a single sign-in is enough: other projects copy that grant and get the
// location whose name matches the project.

const STOP = new Set(["multan", "the", "and", "pvt", "ltd", "private", "limited", "company", "main", "office", "best"]);
const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP.has(w))
  );

/** The location clearly named after the project (all/most of the project
 *  name's words in the location title), or null when it's ambiguous. */
export function matchLocation(locations: GbpLocation[], projectName: string): GbpLocation | null {
  const want = words(projectName);
  if (!want.size) return null;
  const scored = locations
    .map((l) => {
      const have = words(l.title);
      const shared = [...want].filter((w) => have.has(w)).length;
      return { l, score: shared / want.size, shared };
    })
    .filter((x) => x.score >= 0.6 && x.shared >= 1)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  if (scored.length > 1 && scored[1].score === scored[0].score) return null;
  return scored[0].l;
}

/** Existing grants, one per Google account (the newest project using it). */
export async function existingGrants(): Promise<{ sourceProjectId: string; email: string | null; locations: number }[]> {
  const { data } = await db.from("gbp_connections").select("project_id, connected_email, locations, connected_at").order("connected_at", { ascending: false });
  const seen = new Map<string, { sourceProjectId: string; email: string | null; locations: number }>();
  for (const r of (data ?? []) as { project_id: string; connected_email: string | null; locations: GbpLocation[] }[]) {
    const k = r.connected_email ?? r.project_id;
    if (!seen.has(k)) seen.set(k, { sourceProjectId: r.project_id, email: r.connected_email, locations: r.locations.length });
  }
  return [...seen.values()];
}

/** Gives `projectId` the same Google grant as `sourceProjectId`, picking the
 *  matching location when there is one. Returns the chosen location. */
export async function linkFromGrant(projectId: string, sourceProjectId: string, projectName: string): Promise<GbpLocation | null> {
  const { data: src } = await db
    .from("gbp_connections")
    .select("refresh_token_enc, connected_email, locations")
    .eq("project_id", sourceProjectId)
    .maybeSingle();
  if (!src) throw new Error("That Google connection no longer exists.");
  const locations = src.locations as GbpLocation[];
  const match = matchLocation(locations, projectName);
  const { error } = await db.from("gbp_connections").upsert(
    {
      project_id: projectId,
      refresh_token_enc: src.refresh_token_enc,
      connected_email: src.connected_email,
      locations,
      selected_location: match?.name ?? null,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "project_id" }
  );
  if (error) throw new Error(error.message);
  return match;
}
