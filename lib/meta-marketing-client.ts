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

export async function listMetaAdAccounts(): Promise<unknown> {
  return metaMarketingRequest("me/adaccounts", "GET", {
    fields: "id,name,account_status,currency,timezone_name,business_name,amount_spent,balance",
  });
}
