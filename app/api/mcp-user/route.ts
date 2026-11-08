import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { verifyAccessToken, MCP_USER_METADATA_URL } from "@/lib/mcp-oauth";
import { registerUserTools, USER_SERVER_INSTRUCTIONS, type McpUser } from "@/lib/mcp-user-tools";
import { db } from "@/lib/dashboard/db";

/**
 * Restricted MCP for invited users (Claude web/desktop custom connector).
 * Different resource and token audience from the admin MCP (/api/mcp): an
 * admin token is rejected here and a user token is rejected there. The user
 * is re-read from mcp_users on EVERY request, so removing someone or
 * un-ticking is_active locks them out at once; their tools and project list
 * are whatever the row says right now.
 */

export const maxDuration = 60;

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json", "WWW-Authenticate": `Bearer resource_metadata="${MCP_USER_METADATA_URL}"` },
  });
}

async function handle(request: Request): Promise<Response> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const verified = token ? verifyAccessToken(token) : null;
  if (!verified || verified.aud !== "user" || !verified.userId) return unauthorized();

  const { data } = await db.from("mcp_users").select("id, email, name, is_active, project_ids, groups").eq("id", verified.userId).maybeSingle();
  if (!data || !data.is_active) {
    return new Response(JSON.stringify({ error: "forbidden", error_description: "This access has been removed." }), { status: 403, headers: { "Content-Type": "application/json" } });
  }
  void db.from("mcp_users").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id).then(() => undefined);

  const user: McpUser = { id: data.id as string, email: data.email as string, name: (data.name as string | null) ?? null, project_ids: (data.project_ids as string[]) ?? [], groups: (data.groups as string[]) ?? [] };
  const server = new McpServer({ name: "adsbyshoaib-user-mcp", version: "1.0.0" }, { instructions: USER_SERVER_INSTRUCTIONS });
  registerUserTools(server, user);

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
