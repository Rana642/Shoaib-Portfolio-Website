import "server-only";
import { db } from "./dashboard/db";
import { getVaultCredential } from "./marketing-vault";
import { encryptToken } from "./social-crypto";

/**
 * Posting to Shoaib's own LinkedIn *profile* (not a Company Page). Company
 * Pages need the Community Management API, still under LinkedIn review — and
 * LinkedIn requires that product to be alone on its app. So personal posting
 * runs on a SEPARATE LinkedIn app with the self-serve products "Sign In with
 * LinkedIn using OpenID Connect" + "Share on LinkedIn" (scope
 * w_member_social). Its client_id / client_secret are in the API Vault as
 * service "linkedin_personal".
 *
 * The profile is saved as an ordinary client_social_accounts row (platform
 * "linkedin", external_id "urn:li:person:…"), so the Planner, cron and
 * postLinkedInPhoto() treat it like any other LinkedIn account. LinkedIn
 * gives self-serve apps no refresh token: the access token lasts 60 days,
 * then the profile has to be connected again.
 */

export const LINKEDIN_PERSONAL_SCOPES = "openid profile email w_member_social";
export const LINKEDIN_PERSONAL_CALLBACK = "/api/social/linkedin-personal-callback";

async function appCredentials() {
  const cred = await getVaultCredential("linkedin_personal");
  if (!cred.client_id || !cred.client_secret) throw new Error("The 'linkedin_personal' credential in the API Vault needs client_id and client_secret.");
  return { clientId: cred.client_id.trim(), clientSecret: cred.client_secret.trim() };
}

export async function linkedinPersonalAuthorizeUrl(origin: string, projectId: string): Promise<string> {
  const { clientId } = await appCredentials();
  const u = new URL("https://www.linkedin.com/oauth/v2/authorization");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", origin + LINKEDIN_PERSONAL_CALLBACK);
  u.searchParams.set("scope", LINKEDIN_PERSONAL_SCOPES);
  u.searchParams.set("state", projectId);
  return u.toString();
}

/** Code → token, then who the person is (OpenID userinfo). */
export async function exchangeLinkedInPersonalCode(code: string, origin: string) {
  const { clientId, clientSecret } = await appCredentials();
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, client_secret: clientSecret, redirect_uri: origin + LINKEDIN_PERSONAL_CALLBACK }),
    cache: "no-store",
  });
  const tok = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!res.ok || !tok.access_token) throw new Error(`LinkedIn sign-in failed: ${tok.error_description || tok.error || res.status}`);

  const me = await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` }, cache: "no-store" });
  const info = (await me.json()) as { sub?: string; name?: string; email?: string };
  if (!me.ok || !info.sub) throw new Error("LinkedIn didn't say whose profile this is.");
  return { accessToken: tok.access_token, expiresIn: tok.expires_in ?? null, personUrn: `urn:li:person:${info.sub}`, name: info.name ?? info.email ?? "LinkedIn profile" };
}

/** Saves (or refreshes, on reconnect) the profile on a project. */
export async function saveLinkedInPersonalAccount(projectId: string, p: Awaited<ReturnType<typeof exchangeLinkedInPersonalCode>>) {
  const row = {
    project_id: projectId,
    platform: "linkedin" as const,
    label: `${p.name} (personal profile)`,
    external_id: p.personUrn,
    access_token_encrypted: encryptToken(p.accessToken),
    token_expires_at: p.expiresIn ? new Date(Date.now() + p.expiresIn * 1000).toISOString() : null,
  };
  const { data: existing } = await db
    .from("client_social_accounts")
    .select("id")
    .eq("project_id", projectId)
    .eq("platform", "linkedin")
    .eq("external_id", p.personUrn)
    .maybeSingle();
  const { error } = existing
    ? await db.from("client_social_accounts").update(row).eq("id", existing.id)
    : await db.from("client_social_accounts").insert(row);
  if (error) throw new Error(error.message);
}
