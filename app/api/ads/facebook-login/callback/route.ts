import { NextResponse } from "next/server";
import { getUser } from "@/lib/dashboard/auth";
import { getVaultCredential } from "@/lib/marketing-vault";
import { GRAPH_BASE } from "@/lib/social-fb";
import { db } from "@/lib/dashboard/db";

/**
 * "Facebook Login for Business" redirect target — the registered Valid
 * OAuth Redirect URI on the "ABS Marketing" app. Reached via
 * /api/dashboard/ads/facebook-login/authorize, which sets `state` to the
 * target client_projects id.
 *
 * Deliberately doesn't persist anything yet — this proves the connect flow
 * works end-to-end (real access token, real discovered ad account(s)) and
 * is what gets recorded for Meta's App Review demo. The existing meta_ads_*
 * MCP tools keep reading from the vault's own System User token; wiring a
 * per-project token store is a separate step if/when Shoaib wants clients
 * to self-connect rather than him doing this himself as their agency.
 */
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized — log into /dashboard first, then retry the connect link." },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const projectId = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  if (errorParam) {
    return NextResponse.json({ error: errorParam, error_description: url.searchParams.get("error_description") }, { status: 400 });
  }
  if (!code || !projectId) {
    return NextResponse.json({ error: "Missing code or state in the callback URL." }, { status: 400 });
  }

  let app_id: string, app_secret: string;
  try {
    ({ app_id, app_secret } = await getVaultCredential("meta_marketing"));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Couldn't load the meta_marketing app credentials." }, { status: 500 });
  }

  const redirectUri = `${url.origin}/api/ads/facebook-login/callback`;

  async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
    const u = new URL(`${GRAPH_BASE}${path}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    const res = await fetch(u.toString());
    const body = (await res.json()) as T & { error?: { message?: string } };
    if (!res.ok || (body as { error?: { message?: string } }).error) {
      throw new Error((body as { error?: { message?: string } }).error?.message || `Graph API error (HTTP ${res.status})`);
    }
    return body;
  }

  try {
    // Exchange the auth code for a short-lived user token, then upgrade it.
    const { access_token: shortLived } = await graphGet<{ access_token: string }>("/oauth/access_token", {
      client_id: app_id,
      client_secret: app_secret,
      redirect_uri: redirectUri,
      code,
    });
    const { access_token: userToken } = await graphGet<{ access_token: string }>("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: app_id,
      client_secret: app_secret,
      fb_exchange_token: shortLived,
    });

    // Discover ad accounts two ways, same as lib/meta-marketing-client.ts's
    // listMetaAdAccounts — /me/adaccounts misses accounts assigned as a
    // *client* ad account on a Business rather than owned/assigned directly.
    const fields = "id,name,account_status,currency,business_name";
    const direct = await graphGet<{ data?: { id: string; name: string }[] }>("/me/adaccounts", { fields, access_token: userToken });
    const businesses = await graphGet<{ data?: { id: string }[] }>("/me/businesses", { fields: "id", access_token: userToken });

    const merged = new Map<string, { id: string; name: string }>();
    for (const acc of direct.data ?? []) merged.set(acc.id, acc);
    for (const biz of businesses.data ?? []) {
      for (const edge of ["owned_ad_accounts", "client_ad_accounts"]) {
        try {
          const res = await graphGet<{ data?: { id: string; name: string }[] }>(`/${biz.id}/${edge}`, { fields, access_token: userToken });
          for (const acc of res.data ?? []) merged.set(acc.id, acc);
        } catch {
          /* no permission on this edge for this business — skip */
        }
      }
    }

    const { data: project } = await db.from("client_projects").select("name").eq("id", projectId).maybeSingle();
    const accounts = [...merged.values()];
    const lines = accounts.length
      ? accounts.map((a) => `<li>${a.name} (${a.id})</li>`).join("")
      : "<li>No ad accounts found for this login.</li>";

    return new NextResponse(
      `<!doctype html><html><body style="font-family:system-ui;max-width:560px;margin:60px auto">
        <h1>Connected ✓</h1>
        <p>Project: <strong>${project?.name ?? projectId}</strong></p>
        <p>Ad accounts this login can access:</p>
        <ul>${lines}</ul>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Connect failed." }, { status: 502 });
  }
}
