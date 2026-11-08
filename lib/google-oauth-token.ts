import "server-only";
import { getVaultCredential } from "./marketing-vault";

/**
 * Every Google marketing API in the vault (google_ads, ga4, gsc, gtm) was
 * authorized the same way: an installed-app OAuth client (client_id +
 * client_secret) plus a long-lived refresh_token. No caching — this is a
 * stateless serverless/CLI context, and Google's token endpoint is cheap
 * enough to hit once per tool call.
 */
/** The Workspace APIs share one OAuth token (one Playground round covers all their scopes). */
export const WORKSPACE_SERVICES = ["gmail", "google_calendar", "google_caldav", "google_docs", "google_sheets", "google_forms", "google_tasks", "google_classroom"];

/**
 * A Workspace service without its own vault entry borrows the token of the
 * "google_workspace" entry, else of any other Workspace entry that has a
 * refresh_token, so one pasted credential serves all of them.
 */
async function credentialFor(service: string): Promise<Record<string, string>> {
  try {
    return await getVaultCredential(service);
  } catch (own) {
    if (!WORKSPACE_SERVICES.includes(service)) throw own;
    for (const alt of ["google_workspace", ...WORKSPACE_SERVICES.filter((s) => s !== service)]) {
      try {
        const cred = await getVaultCredential(alt);
        if (cred.client_id && cred.client_secret && cred.refresh_token) return cred;
      } catch {
        /* try the next one */
      }
    }
    throw own;
  }
}

export async function getGoogleAccessToken(service: string): Promise<string> {
  const cred = await credentialFor(service);
  if (!cred.client_id || !cred.client_secret || !cred.refresh_token) {
    throw new Error(`'${service}' credential is missing client_id/client_secret/refresh_token.`);
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cred.client_id,
      client_secret: cred.client_secret,
      refresh_token: cred.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Google OAuth token refresh failed for '${service}': ${json.error_description || json.error || res.status}`);
  }
  return json.access_token as string;
}
