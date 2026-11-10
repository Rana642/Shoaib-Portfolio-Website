import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "./dashboard/db";
import { kbScope } from "./kb-scope";
import { registerKnowledgeTools } from "./mcp-knowledge-tools";
import { DESIGN_INSTRUCTIONS, registerUserDesignTools } from "./mcp-user-design-tools";

/**
 * Tools of the restricted USER MCP (/api/mcp-user). The user gets only what the
 * admin granted in mcp_users: tool groups and project ids. Phase 1: group
 * "kb_read" = read-only Knowledge Base of the granted projects. Everything runs
 * inside kbScope, so project lookups cannot see any other project, and a tool
 * that is not on the allow-list is never registered at all.
 */

export type McpUser = { id: string; email: string; name: string | null; project_ids: string[]; groups: string[] };

export const USER_SERVER_INSTRUCTIONS =
  "You are connected to a restricted, read-only view of the Ads by Shoaib knowledge base. You can only see the projects that were granted to you. Start with kb_list_projects, then kb_get_brief for a project. Anything you write in answers must come from what these tools return; if the knowledge base does not say it, say you do not know.";

/** The server instructions for this user: the read-only base, plus the design workflow when "kb_design" is granted. */
export function userServerInstructions(groups: string[]): string {
  if (!groups.includes("kb_design")) return USER_SERVER_INSTRUCTIONS;
  return `${USER_SERVER_INSTRUCTIONS.replace("a restricted, read-only view of", "a restricted view of")} You may also save pictures to your own project's knowledge base. ${DESIGN_INSTRUCTIONS}`;
}

/** Read-only KB tools that take a projectName (scoped by kbScope) or are safe as they are. */
const KB_READ_TOOLS = new Set(["kb_get_brief", "kb_list_docs", "kb_get_doc", "kb_list_products", "kb_get_product", "kb_list_assets", "kb_get_asset", "kb_get_global_rules"]);

type Handler = (args: Record<string, unknown>, extra: unknown) => Promise<unknown>;

const errorResult = (message: string) => ({ content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true });

export function registerUserTools(server: McpServer, user: McpUser): void {
  const allowedProjectIds = new Set(user.project_ids);

  if (user.groups.includes("kb_read")) {
    // Let the normal KB code register itself against a filter: only allow-listed read tools get through, each wrapped in the user's scope.
    const filter = {
      registerTool(name: string, config: unknown, handler: Handler) {
        if (!KB_READ_TOOLS.has(name)) return;
        const wrapped: Handler = async (args, extra) => {
          if (name === "kb_get_asset") {
            // looked up by id, not by project: check which project the file belongs to
            const { data } = await db.from("project_assets").select("project_id").eq("id", String(args.assetId)).maybeSingle();
            if (!data || !allowedProjectIds.has(data.project_id as string)) return errorResult("No such asset.");
          }
          return kbScope.run({ allowedProjectIds }, () => handler(args, extra));
        };
        (server.registerTool as unknown as (n: string, c: unknown, h: Handler) => unknown)(name, config, wrapped);
      },
    };
    registerKnowledgeTools(filter as unknown as McpServer);

    server.registerTool(
      "kb_list_projects",
      {
        title: "List My Projects",
        description: "Lists the projects you can see in the knowledge base (name, and how many docs, products and files each has). Start here.",
        inputSchema: {},
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async () => {
        try {
          const ids = [...allowedProjectIds];
          if (!ids.length) return { content: [{ type: "text" as const, text: "No project has been granted to you yet." }] };
          const [{ data: projects }, { data: docs }, { data: products }, { data: assets }] = await Promise.all([
            db.from("client_projects").select("id, name, clients(name)").in("id", ids),
            db.from("project_knowledge_docs").select("project_id").in("project_id", ids),
            db.from("project_products").select("project_id").in("project_id", ids),
            db.from("project_assets").select("project_id").in("project_id", ids),
          ]);
          const count = (rows: { project_id: string }[] | null, id: string) => (rows ?? []).filter((r) => r.project_id === id).length;
          const lines = ((projects ?? []) as unknown as { id: string; name: string; clients: { name: string } | { name: string }[] | null }[]).map((p) => {
            const client = Array.isArray(p.clients) ? p.clients[0]?.name : p.clients?.name;
            return `- ${client ?? "?"} — ${p.name}: ${count(docs, p.id)} docs, ${count(products, p.id)} products, ${count(assets, p.id)} files`;
          });
          return { content: [{ type: "text" as const, text: lines.join("\n") }] };
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      }
    );
  }

  // Group "kb_design": design brief + saving pictures to the user's own project (lib/mcp-user-design-tools.ts).
  if (user.groups.includes("kb_design")) registerUserDesignTools(server, user);

  // Always-available, harmless: who am I and what may I do.
  server.registerTool(
    "whoami",
    {
      title: "My Access",
      description: "Shows who you are signed in as and what you are allowed to use.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => ({ content: [{ type: "text" as const, text: JSON.stringify({ email: user.email, name: user.name, groups: user.groups, projects: user.project_ids.length }, null, 2) }] })
  );
  void z;
}
