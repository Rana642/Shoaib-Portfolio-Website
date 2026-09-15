import { NextResponse } from "next/server";
import { MCP_RESOURCE_URL } from "@/lib/mcp-oauth";

/**
 * RFC 9728 protected resource metadata — points at the authorization
 * server that issues tokens for app/api/mcp. The 401 response from that
 * route also points here directly via WWW-Authenticate, which the docs
 * call the more reliable discovery path; this file covers the fallback
 * probe Claude does if that header is ever missing.
 */
export async function GET() {
  return NextResponse.json({
    resource: MCP_RESOURCE_URL,
    authorization_servers: ["https://adsbyshoaib.com"],
  });
}
