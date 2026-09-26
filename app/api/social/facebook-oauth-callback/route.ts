import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/dashboard/auth";
import { GRAPH_BASE } from "@/lib/social-fb";
import { connectFacebookAccount } from "@/lib/social-accounts";

/** Redirect target for the Planner's Facebook Login for Business flow (the
 *  Valid OAuth Redirect URI to register on the "Ads by Shoaib" app). Trades
 *  the auth code for a short-lived User token, then hands off to the exact
 *  same connectFacebookAccount() the manual-paste form already used —
 *  long-lived exchange, storage, and Page/Instagram discovery all reused
 *  as-is. Discovered Pages aren't returned here (this is a plain redirect,
 *  not a page); go to /dashboard/social and use the existing "Refresh
 *  pages" action to see them and map to projects. */
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
  const errorParam = url.searchParams.get("error");
  if (errorParam) {
    return NextResponse.json({ error: errorParam, error_description: url.searchParams.get("error_description") }, { status: 400 });
  }
  if (!code) return NextResponse.json({ error: "No ?code= in the callback URL." }, { status: 400 });

  const appId = process.env.META_APP_ID || "";
  const appSecret = process.env.META_APP_SECRET || "";
  if (!appId || !appSecret) {
    return NextResponse.json({ error: "META_APP_ID / META_APP_SECRET are not configured." }, { status: 500 });
  }

  try {
    const tokenUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", `${url.origin}/api/social/facebook-oauth-callback`);
    tokenUrl.searchParams.set("code", code);
    const res = await fetch(tokenUrl.toString());
    const body = (await res.json()) as { access_token?: string; error?: { message?: string } };
    if (!res.ok || !body.access_token) {
      throw new Error(body.error?.message || `Token exchange failed (HTTP ${res.status})`);
    }

    await connectFacebookAccount(body.access_token);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Connect failed." }, { status: 502 });
  }

  return NextResponse.redirect(new URL("/dashboard/social?fb=connected", url.origin));
}
