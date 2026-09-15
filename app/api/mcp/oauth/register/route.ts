import { NextResponse } from "next/server";
import { registerClient } from "@/lib/mcp-oauth";

/**
 * RFC 7591 Dynamic Client Registration — Claude calls this once per fresh
 * connection to register itself as an OAuth client before starting the
 * authorize step. Public client only (no client_secret): Claude's DCR
 * clients authenticate via PKCE, not a confidential secret.
 */
export async function POST(request: Request) {
  let body: { redirect_uris?: unknown; client_name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_client_metadata", error_description: "Body must be JSON." }, { status: 400 });
  }

  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (redirectUris.length === 0) {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "redirect_uris is required." },
      { status: 400 }
    );
  }
  const clientName = typeof body.client_name === "string" ? body.client_name : null;

  const client = await registerClient(clientName, redirectUris);

  return NextResponse.json({
    client_id: client.client_id,
    client_name: client.client_name,
    redirect_uris: client.redirect_uris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  });
}
