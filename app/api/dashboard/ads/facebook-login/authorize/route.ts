import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/dashboard/auth";
import { getVaultCredential } from "@/lib/marketing-vault";
import { GRAPH_BASE } from "@/lib/social-fb";

/** Step 1 of the Meta "Facebook Login for Business" connect flow — used to
 *  onboard a client's ad account onto the Marketing API (separate from the
 *  social-poster's Facebook connect, which only needs Page access). Redirects
 *  to Facebook's own consent screen, carrying the target project id as
 *  `state` so /api/ads/facebook-login/callback knows which project to
 *  attach the result to. Uses the "ABS Marketing" app (the one meta_ads_*
 *  MCP tools already run against — vault service `meta_marketing`), not the
 *  "Ads by Shoaib" posting app. */
export async function GET(request: Request) {
  const user = await getAdminUser();
  if (!user) return NextResponse.redirect(new URL("/dashboard/login", request.url));

  const url = new URL(request.url);
  const projectId = url.searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "Missing project_id." }, { status: 400 });

  let app_id: string;
  try {
    ({ app_id } = await getVaultCredential("meta_marketing"));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Couldn't load the meta_marketing app credentials." }, { status: 500 });
  }

  const authorizeUrl = new URL(`${GRAPH_BASE.replace("graph.facebook.com", "www.facebook.com")}/dialog/oauth`);
  authorizeUrl.searchParams.set("client_id", app_id);
  authorizeUrl.searchParams.set("redirect_uri", `${url.origin}/api/ads/facebook-login/callback`);
  authorizeUrl.searchParams.set("scope", "ads_management,ads_read,business_management");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("state", projectId);

  return NextResponse.redirect(authorizeUrl.toString());
}
