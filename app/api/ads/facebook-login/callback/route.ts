import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/dashboard/auth";
import { getVaultCredential } from "@/lib/marketing-vault";
import { GRAPH_BASE } from "@/lib/social-fb";
import { discoverWithToken, saveConnection } from "@/lib/meta-ads-connections";

/**
 * "Facebook Login for Business" redirect target — the registered Valid
 * OAuth Redirect URI on the "ABS Marketing" app. Reached via
 * /api/dashboard/ads/facebook-login/authorize, which sets `state` to the
 * target client_projects id. Exchanges the code for a long-lived token,
 * discovers what the person granted (their name, ad accounts, Pages), saves
 * it encrypted per project, then opens /dashboard/ads for that project.
 */
export async function GET(request: Request) {
  const user = await getAdminUser();
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
    const back = projectId ? `/dashboard/ads?project=${projectId}&` : "/dashboard/ads?";
    return NextResponse.redirect(new URL(`${back}error=${encodeURIComponent(url.searchParams.get("error_description") || "Facebook connection was cancelled.")}`, url.origin));
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
    const { access_token: userToken, expires_in: expiresIn } = await graphGet<{ access_token: string; expires_in?: number }>("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: app_id,
      client_secret: app_secret,
      fb_exchange_token: shortLived,
    });

    const found = await discoverWithToken(userToken);
    await saveConnection(projectId, userToken, expiresIn ?? null, found);
    return NextResponse.redirect(new URL(`/dashboard/ads?project=${projectId}&connected=1`, url.origin));
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Connect failed.";
    return NextResponse.redirect(new URL(`/dashboard/ads?project=${projectId}&error=${encodeURIComponent(msg)}`, url.origin));
  }
}
