import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { verifyAccessToken, MCP_METADATA_URL } from "@/lib/mcp-oauth";
import { registerRemoteSocialTools } from "@/lib/mcp-remote-tools";
import { registerMarketingTools } from "@/lib/mcp-marketing-tools";
import { registerKnowledgeTools, KB_SERVER_INSTRUCTIONS } from "@/lib/mcp-knowledge-tools";

/**
 * Remote MCP endpoint for Claude web/mobile/desktop custom connectors —
 * the counterpart to mcp/index.ts (stdio, Claude Code only). Runs stateless
 * (no sessionIdGenerator): Vercel functions don't persist memory between
 * invocations anyway, so a fresh McpServer + transport per request is both
 * the simplest option and the only one that actually works here.
 */

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer resource_metadata="${MCP_METADATA_URL}"`,
    },
  });
}

async function handle(request: Request): Promise<Response> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const verified = token ? verifyAccessToken(token) : null;
  if (!verified) return unauthorized();

  const server = new McpServer({ name: "adsbyshoaib-social-mcp-remote", version: "1.0.0" }, { instructions: KB_SERVER_INSTRUCTIONS });
  registerRemoteSocialTools(server);
  registerMarketingTools(server);
  registerKnowledgeTools(server);

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
