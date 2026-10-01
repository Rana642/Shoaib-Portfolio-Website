import "server-only";
import { db } from "./dashboard/db";
import { decryptField, isApiVaultCryptoConfigured } from "./api-vault-crypto";
import { decryptAccountToken, updateInstagramLoginToken } from "./social-accounts";
import type { ClientSocialAccount } from "./dashboard/types";

/**
 * Instagram API with Instagram Login ("Business Login for Instagram") — for
 * Instagram professional accounts that aren't linked to a Facebook Page, so
 * the Facebook import can't find them (Shoaib, 2026-10-01). Runs on the
 * "Ads by Shoaib" app's Instagram product (its own Instagram app id/secret,
 * kept in the API Vault as service "instagram_login": app_id, app_secret).
 *
 * The app is unpublished (Standard Access): it works for accounts Shoaib
 * manages once each one is added under App roles → Instagram Testers and
 * accepts the invite. Clients connecting accounts themselves would need
 * Advanced Access (App Review + business verification).
 *
 * These accounts sit in client_social_accounts as platform "instagram" like
 * the Page-linked ones; what tells them apart is token_expires_at — Page
 * tokens never expire (null), Instagram user tokens last 60 days and are
 * refreshed here. Their API host is graph.instagram.com, not graph.facebook.com.
 */

export const IG_LOGIN_GRAPH_BASE = "https://graph.instagram.com/v26.0";
export const IG_LOGIN_SCOPES = ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights"];
/** Refresh once a token has less than this left (and is over a day old —
 *  Instagram refuses to refresh younger tokens). */
const REFRESH_WHEN_LEFT_MS = 20 * 24 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const LIFETIME_MS = 60 * DAY_MS;

export function isInstagramLoginAccount(account: Pick<ClientSocialAccount, "platform" | "token_expires_at">): boolean {
  return account.platform === "instagram" && account.token_expires_at !== null;
}

export async function getInstagramLoginCredentials(): Promise<{ app_id: string; app_secret: string }> {
  if (!isApiVaultCryptoConfigured) throw new Error("API_VAULT_ENCRYPTION_KEY is not configured.");
  const { data: row, error } = await db.from("api_credentials").select("fields").eq("service", "instagram_login").maybeSingle();
  if (error || !row) {
    throw new Error("No 'instagram_login' credential in the API Vault yet — add the Instagram app id and secret (Dashboard → API Vault → Instagram API).");
  }
  const fields = row.fields as Record<string, string>;
  if (!fields.app_id || !fields.app_secret) throw new Error("The 'instagram_login' credential needs both app_id and app_secret.");
  try {
    return { app_id: decryptField(fields.app_id), app_secret: decryptField(fields.app_secret) };
  } catch {
    throw new Error("Couldn't decrypt the stored Instagram app id/secret.");
  }
}

type IgError = { error?: { message?: string } | string; error_message?: string; error_type?: string };
const errorText = (body: IgError, status: number) =>
  (typeof body.error === "object" ? body.error?.message : body.error) || body.error_message || `Instagram API error (HTTP ${status})`;

export function instagramAuthorizeUrl(appId: string, redirectUri: string, state: string): string {
  const u = new URL("https://www.instagram.com/oauth/authorize");
  u.searchParams.set("client_id", appId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", IG_LOGIN_SCOPES.join(","));
  u.searchParams.set("state", state);
  // Always show the login screen, so a second client account can be added
  // without first logging out of the previous one in the browser.
  u.searchParams.set("force_reauth", "true");
  return u.toString();
}

/** code → short-lived token → long-lived (60-day) token. */
export async function exchangeInstagramCode(code: string, redirectUri: string): Promise<{ access_token: string; expires_in: number }> {
  const { app_id, app_secret } = await getInstagramLoginCredentials();
  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: app_id, client_secret: app_secret, grant_type: "authorization_code", redirect_uri: redirectUri, code }),
  });
  const body = (await res.json()) as IgError & { access_token?: string; data?: { access_token?: string }[] };
  const short = body.access_token ?? body.data?.[0]?.access_token;
  if (!res.ok || !short) throw new Error(errorText(body, res.status));

  const u = new URL("https://graph.instagram.com/access_token");
  u.searchParams.set("grant_type", "ig_exchange_token");
  u.searchParams.set("client_secret", app_secret);
  u.searchParams.set("access_token", short);
  const res2 = await fetch(u);
  const long = (await res2.json()) as IgError & { access_token?: string; expires_in?: number };
  if (!res2.ok || !long.access_token) throw new Error(errorText(long, res2.status));
  return { access_token: long.access_token, expires_in: long.expires_in ?? LIFETIME_MS / 1000 };
}

/** The professional account behind a token. user_id is the account's
 *  Instagram ID — the same id the Facebook import stores for a Page-linked
 *  account, which is how a double connection is spotted. */
export async function instagramMe(token: string): Promise<{ user_id: string; username: string; name: string | null; account_type: string | null; followers_count: number | null }> {
  const u = new URL(`${IG_LOGIN_GRAPH_BASE}/me`);
  u.searchParams.set("fields", "user_id,username,name,account_type,followers_count");
  u.searchParams.set("access_token", token);
  const res = await fetch(u);
  const body = (await res.json()) as IgError & { user_id?: string | number; id?: string; username?: string; name?: string; account_type?: string; followers_count?: number };
  if (!res.ok || !body.username) throw new Error(errorText(body, res.status));
  return {
    user_id: String(body.user_id ?? body.id),
    username: body.username,
    name: body.name ?? null,
    account_type: body.account_type ?? null,
    followers_count: body.followers_count ?? null,
  };
}

async function refreshToken(token: string): Promise<{ access_token: string; expires_in: number }> {
  const u = new URL("https://graph.instagram.com/refresh_access_token");
  u.searchParams.set("grant_type", "ig_refresh_token");
  u.searchParams.set("access_token", token);
  const res = await fetch(u);
  const body = (await res.json()) as IgError & { access_token?: string; expires_in?: number };
  if (!res.ok || !body.access_token) throw new Error(errorText(body, res.status));
  return { access_token: body.access_token, expires_in: body.expires_in ?? LIFETIME_MS / 1000 };
}

/** A usable token for an Instagram-login account, refreshed first when it's
 *  getting old. A failed refresh keeps the current token while it's valid. */
export async function getFreshInstagramLoginToken(account: ClientSocialAccount): Promise<string> {
  const token = decryptAccountToken(account);
  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : Infinity;
  const left = expiresAt - Date.now();
  if (left <= 0) throw new Error(`The Instagram login for ${account.label} expired — log in with Instagram again on the Connections page.`);
  const age = LIFETIME_MS - left;
  if (left > REFRESH_WHEN_LEFT_MS || age < DAY_MS) return token;
  try {
    const fresh = await refreshToken(token);
    await updateInstagramLoginToken(account.id, fresh.access_token, fresh.expires_in);
    return fresh.access_token;
  } catch {
    return token;
  }
}

/** Keeps every Instagram-login token alive even on projects that rarely post
 *  — called from the social cron. Returns how many were refreshed. */
export async function refreshExpiringInstagramLogins(): Promise<number> {
  const soon = new Date(Date.now() + REFRESH_WHEN_LEFT_MS).toISOString();
  const { data } = await db
    .from("client_social_accounts")
    .select("*")
    .eq("platform", "instagram")
    .eq("is_active", true)
    .not("token_expires_at", "is", null)
    .lt("token_expires_at", soon);
  let n = 0;
  for (const account of (data ?? []) as ClientSocialAccount[]) {
    const before = account.access_token_encrypted;
    try {
      await getFreshInstagramLoginToken(account);
      const { data: after } = await db.from("client_social_accounts").select("access_token_encrypted").eq("id", account.id).maybeSingle();
      if (after && after.access_token_encrypted !== before) n++;
    } catch {
      /* expired — the Connections page shows it */
    }
  }
  return n;
}
