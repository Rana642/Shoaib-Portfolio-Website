#!/usr/bin/env node
/**
 * MCP server exposing the client social-poster (accounts + scheduled_posts)
 * to Claude Code over stdio, so posting/captioning/scheduling can happen
 * from chat instead of a dashboard chat box. Reuses the app's real lib/
 * business logic (Supabase service-role client, storage, crypto, platform
 * posting) — only the Next.js-only glue (server actions, revalidatePath) is
 * skipped, same rationale as graphics-studio/mcp.
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Must run before importing anything under lib/ — those modules read
// process.env at import time.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../.env.local") });

const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BUCKET",
  "SOCIAL_TOKENS_ENCRYPTION_KEY",
  "API_VAULT_ENCRYPTION_KEY",
] as const;
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`social-mcp-server: missing required env var(s) in .env.local: ${missing.join(", ")}`);
  process.exit(1);
}

const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
const { registerSocialTools } = await import("./tools/social.js");
const { registerMarketingTools } = await import("./tools/marketing.js");

const server = new McpServer({
  name: "adsbyshoaib-social-mcp-server",
  version: "1.0.0",
});

registerSocialTools(server);
registerMarketingTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("adsbyshoaib-social-mcp-server running on stdio");
