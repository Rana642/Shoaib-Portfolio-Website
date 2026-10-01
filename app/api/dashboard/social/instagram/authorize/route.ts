import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/dashboard/auth";
import { getInstagramLoginCredentials, instagramAuthorizeUrl } from "@/lib/social-instagram-login";

/** Step 1 of connecting an Instagram account through Instagram Login (for
 *  accounts not linked to a Facebook Page) — redirects to Instagram's own
 *  login/consent screen with the target project id as `state`, so
 *  /api/social/instagram-oauth-callback knows where to attach the account. */
export async function GET(request: Request) {
  const user = await getAdminUser();
  if (!user) return NextResponse.redirect(new URL("/dashboard/login", request.url));

  const url = new URL(request.url);
  const projectId = url.searchParams.get("project_id");
  if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) return NextResponse.json({ error: "Missing project_id." }, { status: 400 });

  try {
    const { app_id } = await getInstagramLoginCredentials();
    return NextResponse.redirect(instagramAuthorizeUrl(app_id, `${url.origin}/api/social/instagram-oauth-callback`, projectId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Couldn't start the Instagram login." }, { status: 500 });
  }
}
