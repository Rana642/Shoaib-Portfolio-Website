import { NextResponse } from "next/server";
import { getUser } from "@/lib/dashboard/auth";
import { isApiVaultCryptoConfigured } from "@/lib/api-vault-crypto";
import { exchangeTikTokCode, queryTikTokUserInfo, tiktokCredentialModeForDebug } from "@/lib/social-tiktok";
import { saveTikTokAccount } from "@/lib/social-accounts";

/**
 * TikTok Login Kit redirect target. Doubles as two things:
 *  1. The real connect flow — reached via
 *     /api/dashboard/social/tiktok/authorize, which sets `state` to the
 *     target project id. On success this saves the account straight into
 *     client_social_accounts and redirects back to the dashboard.
 *  2. A manual-testing helper (no `state`) — TikTok has no public "OAuth
 *     Playground" equivalent to Google's, so hitting the authorize URL by
 *     hand and landing here with just `?code=` still just displays the raw
 *     token JSON, as before.
 * Gated behind dashboard auth either way, since it's otherwise a public,
 * unauthenticated route.
 */
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized — log into /dashboard first, then retry the TikTok authorize link." },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  if (errorParam) {
    return NextResponse.json({ error: errorParam, error_description: url.searchParams.get("error_description") }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: "No ?code= in the callback URL." }, { status: 400 });
  }
  if (!isApiVaultCryptoConfigured) {
    return NextResponse.json({ error: "API_VAULT_ENCRYPTION_KEY is not configured." }, { status: 500 });
  }

  let tokens;
  try {
    tokens = await exchangeTikTokCode(code, `${url.origin}/api/tiktok/oauth-callback`);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Token exchange failed.",
        // TEMPORARY debug field — remove alongside TIKTOK_SANDBOX_MODE.
        debug_credential_set: tiktokCredentialModeForDebug(),
      },
      { status: 502 }
    );
  }

  // A bare manual test (hitting the authorize URL by hand, or TikTok's own
  // Developer Portal "Try it out") has no state — fall through to just
  // showing the JSON, same as this route's original debug-only behavior.
  const isProjectId = state && /^[0-9a-f-]{36}$/i.test(state);
  if (!isProjectId) {
    return NextResponse.json({ ok: true, token_response: tokens });
  }

  try {
    const userInfo = await queryTikTokUserInfo(tokens.access_token);
    await saveTikTokAccount({
      project_id: state,
      open_id: tokens.open_id,
      display_name: userInfo.display_name || tokens.open_id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Couldn't save the TikTok account." }, { status: 500 });
  }

  return NextResponse.redirect(new URL("/dashboard/social?tiktok=connected", url.origin));
}
