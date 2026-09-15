import { NextResponse } from "next/server";
import { getUser } from "@/lib/dashboard/auth";
import { getTikTokAppCredentials } from "@/lib/social-tiktok";

/** Matches the scopes already added to the TikTok app's Login Kit + Content
 *  Posting API products (see the "Add scopes" step done in the Developer
 *  Portal): profile + stats (shown on the connections page), video.list (the
 *  recent-videos preview), video.publish/video.upload (posting itself). */
const SCOPES = "user.info.basic,user.info.stats,video.list,video.publish,video.upload";

/** Step 1 of the real TikTok connect flow — redirects to TikTok's own
 *  authorize screen, carrying the target project id as `state` so
 *  /api/tiktok/oauth-callback knows which project to attach the account to
 *  once TikTok redirects back. */
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/dashboard/login", request.url));

  const url = new URL(request.url);
  const projectId = url.searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "Missing project_id." }, { status: 400 });

  let client_key: string;
  try {
    ({ client_key } = await getTikTokAppCredentials());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Couldn't load the TikTok app credentials." }, { status: 500 });
  }

  const authorizeUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
  authorizeUrl.searchParams.set("client_key", client_key);
  authorizeUrl.searchParams.set("scope", SCOPES);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", `${url.origin}/api/tiktok/oauth-callback`);
  authorizeUrl.searchParams.set("state", projectId);

  return NextResponse.redirect(authorizeUrl.toString());
}
