import "server-only";
import { getVaultCredential } from "./marketing-vault";

const API_VERSION = "v21.0";
const BASE = `https://graph.facebook.com/${API_VERSION}`;

/** Generic Graph API call for the Marketing API surface (campaigns, adsets,
 *  ads, adcreatives, insights, audiences, ...) — same passthrough approach
 *  as the Google clients, since the Marketing API's object model is far too
 *  large to wrap field-by-field. */
export async function metaMarketingRequest(
  path: string,
  method: "GET" | "POST" | "DELETE",
  params: Record<string, unknown> = {}
): Promise<unknown> {
  const cred = await getVaultCredential("meta_marketing");
  const url = new URL(`${BASE}/${path.replace(/^\//, "")}`);

  if (method === "GET") {
    url.searchParams.set("access_token", cred.access_token);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
    }
    const res = await fetch(url.toString());
    const json = await res.json();
    if (!res.ok) throw new Error(`Meta Marketing API error (${res.status}): ${JSON.stringify(json)}`);
    return json;
  }

  const body = new URLSearchParams();
  body.set("access_token", cred.access_token);
  for (const [k, v] of Object.entries(params)) {
    body.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  const res = await fetch(url.toString(), {
    method,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Meta Marketing API error (${res.status}): ${JSON.stringify(json)}`);
  return json;
}

type AdAccount = { id: string; [key: string]: unknown };
const AD_ACCOUNT_FIELDS = "id,name,account_status,currency,timezone_name,business_name,amount_spent,balance";

/** `/me/adaccounts` alone misses ad accounts that were assigned to the
 *  token's Business Manager as a *client* ad account (vs. owned, or
 *  assigned directly to this system user) — verified live 2026-09-16:
 *  Shoaib had already assigned a real account (act_239008850511120,
 *  PKR 49M+ spent, live campaigns) to the ABS system user, but
 *  /me/adaccounts still came back empty even though the token could
 *  fetch/mutate that account directly by id without issue. So this also
 *  walks every Business Manager behind a connected Page (/me/accounts)
 *  and checks both owned_ad_accounts and client_ad_accounts there,
 *  merging everything into one deduplicated list. */
export async function listMetaAdAccounts(): Promise<{ data: AdAccount[] }> {
  const direct = (await metaMarketingRequest("me/adaccounts", "GET", { fields: AD_ACCOUNT_FIELDS })) as {
    data?: AdAccount[];
  };

  const pages = (await metaMarketingRequest("me/accounts", "GET", { fields: "id,business" })) as {
    data?: { business?: { id: string } }[];
  };
  const businessIds = new Set<string>();
  for (const p of (pages.data ?? []) as { business?: { id: string } }[]) {
    if (p.business?.id) businessIds.add(p.business.id);
  }

  const merged = new Map<string, AdAccount>();
  for (const acc of direct.data ?? []) merged.set(acc.id, acc);

  for (const businessId of businessIds) {
    for (const edge of ["owned_ad_accounts", "client_ad_accounts"]) {
      try {
        const res = (await metaMarketingRequest(`${businessId}/${edge}`, "GET", { fields: AD_ACCOUNT_FIELDS })) as {
          data?: AdAccount[];
        };
        for (const acc of res.data ?? []) merged.set(acc.id, acc);
      } catch {
        /* this token may lack permission on some businesses' edges — skip, not fatal */
      }
    }
  }

  return { data: [...merged.values()] };
}
