import { NextResponse } from "next/server";
import { createAuthorizationCode, getClient, verifyState, MCP_ISSUER } from "@/lib/mcp-oauth";
import { getVaultCredential } from "@/lib/marketing-vault";
import { db } from "@/lib/dashboard/db";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * Google sends the person back here. We trust nothing until:
 *  1. our own signed `state` verifies (so this callback was started by our authorize step, within 10 minutes);
 *  2. Google's token endpoint, called by us with our client secret, returns an id_token for OUR client id;
 *  3. its email is verified by Google AND is in mcp_users and active.
 * Only then does the connecting app get an authorization code bound to that user.
 */

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const page = (status: number, title: string, text: string) =>
  new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:system-ui;background:#FAFAFA;color:#0F0F14;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0"><div style="background:#fff;border:1px solid rgba(15,15,20,.1);border-radius:16px;padding:32px;max-width:420px"><h1 style="font-size:1.2rem;margin:0 0 8px">${title}</h1><p style="color:rgba(15,15,20,.7);line-height:1.5">${text}</p></div>`,
    { status, headers: { "Content-Type": "text/html" } }
  );

function idTokenClaims(idToken: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!(await rateLimit(`mcp-user-callback:${clientIp(request)}`, 20, 600))) return page(429, "Too many attempts", "Please wait a few minutes and try again.");

  const state = verifyState(url.searchParams.get("state") || "");
  if (!state) return page(400, "Link expired", "This sign-in link is invalid or has expired. Start the connection again from Claude.");
  const client = await getClient(state.client_id);
  if (!client || !client.redirect_uris.includes(state.redirect_uri)) return page(400, "Invalid request", "The connecting app is not recognised.");

  const back = new URL(state.redirect_uri);
  if (state.state) back.searchParams.set("state", state.state);
  if (url.searchParams.get("error") || !url.searchParams.get("code")) {
    back.searchParams.set("error", "access_denied");
    return NextResponse.redirect(back.toString(), 303);
  }

  let cred: Record<string, string>;
  try {
    cred = await getVaultCredential("mcp_signin");
  } catch {
    return page(503, "Not available", "Sign-in is not set up. Please tell Shoaib.");
  }
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: url.searchParams.get("code")!, client_id: cred.client_id, client_secret: cred.client_secret, redirect_uri: `${MCP_ISSUER}/api/mcp-user/oauth/google-callback`, grant_type: "authorization_code" }),
  });
  const tokens = (await tokenRes.json().catch(() => ({}))) as { id_token?: string };
  const claims = tokens.id_token ? idTokenClaims(tokens.id_token) : null;
  const valid =
    claims &&
    claims.aud === cred.client_id &&
    (claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com") &&
    claims.email_verified === true &&
    typeof claims.email === "string" &&
    Number(claims.exp) > Math.floor(Date.now() / 1000);
  if (!tokenRes.ok || !valid) return page(400, "Sign-in failed", "Google did not confirm your identity. Please try again.");

  const email = String(claims.email).toLowerCase();
  const { data: user } = await db.from("mcp_users").select("id, is_active").eq("email", email).maybeSingle();
  if (!user || !user.is_active) {
    return page(403, "No access", `The Google account ${esc(email)} has not been given access. Ask Shoaib to add this email, then try again.`);
  }

  const code = await createAuthorizationCode({ clientId: state.client_id, redirectUri: state.redirect_uri, codeChallenge: state.code_challenge, userId: user.id as string });
  back.searchParams.set("code", code);
  return NextResponse.redirect(back.toString(), 303);
}
