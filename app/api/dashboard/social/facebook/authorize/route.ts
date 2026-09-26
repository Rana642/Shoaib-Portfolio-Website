import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/dashboard/auth";
import { GRAPH_BASE } from "@/lib/social-fb";

/** Step 1 of the redirect-based Facebook connect flow for the social
 *  Planner's "Ads by Shoaib" app — replaces manually pasting a token from
 *  Graph API Explorer with a real "Facebook Login for Business" flow.
 *  Not per-project: Shoaib is admin on every client's Page under his own
 *  personal login, so one connect discovers every Page (and linked
 *  Instagram Business account) at once — same model connectFacebookAccount
 *  already assumes (see lib/social-accounts.ts). */
export async function GET(request: Request) {
  const user = await getAdminUser();
  if (!user) return NextResponse.redirect(new URL("/dashboard/login", request.url));

  const appId = process.env.META_APP_ID || "";
  if (!appId) return NextResponse.json({ error: "META_APP_ID is not configured." }, { status: 500 });

  const url = new URL(request.url);
  const authorizeUrl = new URL(`${GRAPH_BASE.replace("graph.facebook.com", "www.facebook.com")}/dialog/oauth`);
  authorizeUrl.searchParams.set("client_id", appId);
  authorizeUrl.searchParams.set("redirect_uri", `${url.origin}/api/social/facebook-oauth-callback`);
  authorizeUrl.searchParams.set(
    "scope",
    "pages_show_list,pages_manage_posts,pages_read_engagement,pages_manage_engagement,instagram_basic,instagram_content_publish,business_management,read_insights"
  );
  authorizeUrl.searchParams.set("response_type", "code");

  return NextResponse.redirect(authorizeUrl.toString());
}
