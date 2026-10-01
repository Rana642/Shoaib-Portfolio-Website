import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/dashboard/auth";
import { exchangeInstagramCode, instagramMe } from "@/lib/social-instagram-login";
import { saveInstagramLoginAccount } from "@/lib/social-accounts";

/**
 * Instagram Login redirect target (registered under the app's Instagram
 * "Business login settings" → OAuth redirect URIs). Exchanges the code for a
 * 60-day token, reads which professional account it belongs to and saves it
 * on the project carried in `state`. Gated behind dashboard auth, since it's
 * otherwise a public route that writes account tokens.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (params: Record<string, string>) => {
    const to = new URL("/dashboard/social", url.origin);
    for (const [k, v] of Object.entries(params)) to.searchParams.set(k, v);
    return NextResponse.redirect(to);
  };

  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: "Log into /dashboard first, then try Instagram login again." }, { status: 401 });

  const errorParam = url.searchParams.get("error");
  if (errorParam) return back({ instagram_error: url.searchParams.get("error_description") || url.searchParams.get("error_reason") || errorParam });
  const code = url.searchParams.get("code");
  const projectId = url.searchParams.get("state");
  if (!code || !projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) return back({ instagram_error: "Instagram didn't send back a login code. Please try again." });

  try {
    // Instagram appends "#_" to the code in some responses.
    const tokens = await exchangeInstagramCode(code.replace(/#_$/, ""), `${url.origin}/api/social/instagram-oauth-callback`);
    const me = await instagramMe(tokens.access_token);
    if (me.account_type && !/business|creator|media_creator/i.test(me.account_type)) {
      return back({ instagram_error: `@${me.username} is a personal account — switch it to a Business or Creator account in Instagram, then connect again.` });
    }
    await saveInstagramLoginAccount({ project_id: projectId, ig_user_id: me.user_id, username: me.username, access_token: tokens.access_token, expires_in: tokens.expires_in });
    return back({ project: projectId, instagram: `@${me.username}` });
  } catch (error) {
    return back({ project: projectId, instagram_error: error instanceof Error ? error.message : "Couldn't connect the Instagram account." });
  }
}
