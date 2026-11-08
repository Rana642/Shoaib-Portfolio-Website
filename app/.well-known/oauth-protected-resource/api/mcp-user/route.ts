import { NextResponse } from "next/server";
import { MCP_USER_RESOURCE_URL, MCP_USER_ISSUER } from "@/lib/mcp-oauth";

/** RFC 9728 metadata for the restricted user MCP (/api/mcp-user). */
export async function GET() {
  return NextResponse.json({ resource: MCP_USER_RESOURCE_URL, authorization_servers: [MCP_USER_ISSUER] });
}
