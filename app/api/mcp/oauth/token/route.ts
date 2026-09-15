import { NextResponse } from "next/server";
import { getClient, consumeAuthorizationCode, verifyPkce, signAccessToken, issueRefreshToken, rotateRefreshToken } from "@/lib/mcp-oauth";

/** Must accept application/x-www-form-urlencoded per RFC 6749 §4.1.3 —
 *  Claude sends both the initial exchange and refresh requests this way. */
export async function POST(request: Request) {
  try {
    return await handlePost(request);
  } catch (error) {
    // TEMPORARY — the route was returning a bare empty 500 with no way to
    // tell why. Remove once the real cause is confirmed fixed.
    return NextResponse.json(
      { error: "server_error", error_description: error instanceof Error ? `${error.message}\n${error.stack}` : String(error) },
      { status: 500 }
    );
  }
}

async function handlePost(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return NextResponse.json({ error: "invalid_request", error_description: "Expected application/x-www-form-urlencoded." }, { status: 400 });
  }
  const body = new URLSearchParams(await request.text());
  const grantType = body.get("grant_type");
  const clientId = body.get("client_id") || "";

  const client = await getClient(clientId);
  if (!client) return NextResponse.json({ error: "invalid_client" }, { status: 401 });

  if (grantType === "authorization_code") {
    const code = body.get("code") || "";
    const codeVerifier = body.get("code_verifier") || "";
    const redirectUri = body.get("redirect_uri") || "";

    const stored = await consumeAuthorizationCode(code, clientId);
    if (!stored) return NextResponse.json({ error: "invalid_grant", error_description: "Code is invalid, expired, or already used." }, { status: 400 });
    if (stored.redirectUri !== redirectUri) {
      return NextResponse.json({ error: "invalid_grant", error_description: "redirect_uri mismatch." }, { status: 400 });
    }
    if (!codeVerifier || !verifyPkce(codeVerifier, stored.codeChallenge)) {
      return NextResponse.json({ error: "invalid_grant", error_description: "PKCE verification failed." }, { status: 400 });
    }

    const { token: access_token, expiresIn } = signAccessToken(clientId);
    const refresh_token = await issueRefreshToken(clientId);
    return NextResponse.json({ access_token, token_type: "Bearer", expires_in: expiresIn, refresh_token });
  }

  if (grantType === "refresh_token") {
    const oldRefreshToken = body.get("refresh_token") || "";
    const newRefreshToken = await rotateRefreshToken(oldRefreshToken, clientId);
    if (!newRefreshToken) {
      return NextResponse.json({ error: "invalid_grant", error_description: "Refresh token is invalid, expired, or revoked." }, { status: 400 });
    }
    const { token: access_token, expiresIn } = signAccessToken(clientId);
    return NextResponse.json({ access_token, token_type: "Bearer", expires_in: expiresIn, refresh_token: newRefreshToken });
  }

  return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
}
