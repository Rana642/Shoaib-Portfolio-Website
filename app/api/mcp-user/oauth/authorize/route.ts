import { NextResponse } from "next/server";
import { getClient, signState, MCP_ISSUER } from "@/lib/mcp-oauth";
import { getVaultCredential } from "@/lib/marketing-vault";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * Authorize endpoint of the restricted user MCP. Instead of the admin's
 * dashboard login it sends the person to Google; the callback
 * (../google-callback) checks the verified Google email against mcp_users.
 * Nothing about the connection is decided here: this only validates Claude's
 * request and starts the Google sign-in, carrying the request in a signed,
 * 10-minute `state`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const p = {
    client_id: url.searchParams.get("client_id") || "",
    redirect_uri: url.searchParams.get("redirect_uri") || "",
    code_challenge: url.searchParams.get("code_challenge") || "",
    code_challenge_method: url.searchParams.get("code_challenge_method") || "",
    state: url.searchParams.get("state") || "",
  };
  if (!p.client_id || !p.redirect_uri || !p.code_challenge) return NextResponse.json({ error: "invalid_request", error_description: "Missing required parameters." }, { status: 400 });
  if (p.code_challenge_method !== "S256") return NextResponse.json({ error: "invalid_request", error_description: "Only S256 code_challenge_method is supported." }, { status: 400 });
  const client = await getClient(p.client_id);
  if (!client) return NextResponse.json({ error: "invalid_request", error_description: "Unknown client_id." }, { status: 400 });
  if (!client.redirect_uris.includes(p.redirect_uri)) return NextResponse.json({ error: "invalid_request", error_description: "redirect_uri does not match this client's registration." }, { status: 400 });
  if (!(await rateLimit(`mcp-user-authorize:${clientIp(request)}`, 30, 600))) return NextResponse.json({ error: "too_many_requests" }, { status: 429 });

  let googleClientId: string;
  try {
    googleClientId = (await getVaultCredential("mcp_signin")).client_id;
    if (!googleClientId) throw new Error("no client_id");
  } catch {
    return new NextResponse("Google sign-in for the user MCP is not set up yet. Please tell Shoaib.", { status: 503, headers: { "Content-Type": "text/plain" } });
  }

  const state = signState({ client_id: p.client_id, redirect_uri: p.redirect_uri, code_challenge: p.code_challenge, state: p.state });
  const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  google.searchParams.set("client_id", googleClientId);
  google.searchParams.set("redirect_uri", `${MCP_ISSUER}/api/mcp-user/oauth/google-callback`);
  google.searchParams.set("response_type", "code");
  google.searchParams.set("scope", "openid email");
  google.searchParams.set("state", state);
  google.searchParams.set("prompt", "select_account");
  return NextResponse.redirect(google.toString(), 302);
}
