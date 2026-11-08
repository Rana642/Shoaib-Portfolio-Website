import { NextResponse } from "next/server";
import { MCP_ISSUER, MCP_USER_ISSUER } from "@/lib/mcp-oauth";

/**
 * RFC 8414 metadata for the user MCP's own authorization server path. Sign-in
 * is Google (app/api/mcp-user/oauth/*); client registration and token exchange
 * reuse the shared endpoints (the audience comes from the sign-in, not from here).
 */
export async function GET() {
  return NextResponse.json({
    issuer: MCP_USER_ISSUER,
    authorization_endpoint: `${MCP_ISSUER}/api/mcp-user/oauth/authorize`,
    token_endpoint: `${MCP_ISSUER}/api/mcp/oauth/token`,
    registration_endpoint: `${MCP_ISSUER}/api/mcp/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
}
