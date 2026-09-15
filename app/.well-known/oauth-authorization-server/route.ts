import { NextResponse } from "next/server";

/**
 * RFC 8414 authorization server metadata for the remote MCP server's OAuth
 * flow (lib/mcp-oauth.ts) — lets Claude.ai discover where to send
 * registration/authorize/token requests without hardcoding them.
 */
export async function GET() {
  const issuer = "https://adsbyshoaib.com";
  return NextResponse.json({
    issuer,
    authorization_endpoint: `${issuer}/api/mcp/oauth/authorize`,
    token_endpoint: `${issuer}/api/mcp/oauth/token`,
    registration_endpoint: `${issuer}/api/mcp/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
}
