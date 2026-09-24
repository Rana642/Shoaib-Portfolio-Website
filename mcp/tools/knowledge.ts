import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerKnowledgeTools as register } from "../../lib/mcp-knowledge-tools.js";

export { KB_SERVER_INSTRUCTIONS } from "../../lib/mcp-knowledge-tools.js";

/** Local stdio server: kb_add_asset may also read a local filePath. */
export function registerKnowledgeTools(server: McpServer): void {
  register(server, { allowLocalFiles: true });
}
