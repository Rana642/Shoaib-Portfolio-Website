import "server-only";
import { getGoogleAccessToken } from "./google-oauth-token";

/**
 * Generic authenticated REST call against a Google API, used by the GA4,
 * GSC, and GTM MCP tools. Each of those APIs has dozens of resource types
 * (properties/streams/audiences for GA4, sites/sitemaps for GSC,
 * containers/tags/triggers for GTM) — a thin path/method/body passthrough
 * reaches all of them without hand-writing a wrapper per resource, the same
 * approach used for Google Ads mutate and the Meta Marketing client.
 */
export async function googleApiRequest(
  service: string,
  baseUrl: string,
  path: string,
  method: string,
  body?: unknown
): Promise<unknown> {
  const accessToken = await getGoogleAccessToken(service);
  const url = `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined && method !== "GET" ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`${service} API error (${res.status}): ${JSON.stringify(json)}`);
  }
  return json;
}
