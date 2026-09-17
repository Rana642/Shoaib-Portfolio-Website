import "server-only";
import { getGoogleAccessToken } from "./google-oauth-token";
import { getVaultCredential } from "./marketing-vault";

// Google Ads API versions sunset on a strict ~1yr schedule — v19/v20/v21
// are already gone (404, not a JSON error) as of 2026-09-16; verified live
// against the real API (not just docs, which can lag) that v22-v25 all work.
const API_VERSION = "v22";
const BASE = `https://googleads.googleapis.com/${API_VERSION}`;

async function headers(loginCustomerId?: string): Promise<Record<string, string>> {
  const [accessToken, cred] = await Promise.all([
    getGoogleAccessToken("google_ads"),
    getVaultCredential("google_ads"),
  ]);
  const h: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": cred.developer_token,
    "Content-Type": "application/json",
  };
  if (loginCustomerId) h["login-customer-id"] = loginCustomerId.replace(/-/g, "");
  return h;
}

async function call(path: string, body: unknown, loginCustomerId?: string) {
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: await headers(loginCustomerId),
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Google Ads API error (${res.status}): ${JSON.stringify(json ?? {})}`);
  }
  return json;
}

/** Lists every customer (account) this refresh token can reach — the
 *  starting point for finding a customerId to pass to search/mutate. */
export async function listAccessibleCustomers(): Promise<unknown> {
  const accessToken = await getGoogleAccessToken("google_ads");
  const cred = await getVaultCredential("google_ads");
  const res = await fetch(`${BASE}/customers:listAccessibleCustomers`, {
    headers: { Authorization: `Bearer ${accessToken}`, "developer-token": cred.developer_token },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google Ads API error (${res.status}): ${JSON.stringify(json)}`);
  return json;
}

/** Arbitrary GAQL read — covers every audit need (campaigns, ad groups, ads,
 *  keywords, search terms, change history, performance metrics, ...). */
export async function googleAdsSearch(customerId: string, gaql: string, loginCustomerId?: string): Promise<unknown> {
  const id = customerId.replace(/-/g, "");
  return call(`customers/${id}/googleAds:search`, { query: gaql }, loginCustomerId);
}

/** Keyword Planner's keyword-ideas generator — search volume, competition,
 *  bid ranges for new keyword suggestions. Not expressible via GAQL
 *  (googleAdsSearch only reports on keywords already in the account); this
 *  is a separate custom-method endpoint. Verified live 2026-09-17 against
 *  a real account (real search-volume data returned for "hotel in multan"). */
export async function generateKeywordIdeas(customerId: string, requestBody: Record<string, unknown>, loginCustomerId?: string): Promise<unknown> {
  const id = customerId.replace(/-/g, "");
  return call(`customers/${id}:generateKeywordIdeas`, requestBody, loginCustomerId);
}

/** Arbitrary create/update/remove across any mutable Google Ads resource
 *  (campaigns, campaignBudgets, adGroups, adGroupAds, adGroupCriteria,
 *  campaignCriteria, ...) — the operations shape matches Google's own
 *  mutate API 1:1, so anything the real API supports is reachable here. */
export async function googleAdsMutate(
  customerId: string,
  resource: string,
  operations: unknown[],
  opts: { loginCustomerId?: string; validateOnly?: boolean } = {}
): Promise<unknown> {
  const id = customerId.replace(/-/g, "");
  return call(
    `customers/${id}/${resource}:mutate`,
    { operations, validateOnly: Boolean(opts.validateOnly), partialFailure: false },
    opts.loginCustomerId
  );
}
