import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "./dashboard/db";

/**
 * ADMIN-only tools (registered on the admin MCP, never on the user MCP) to
 * manage who may connect to /api/mcp-user and what they may see. Granting or
 * changing access needs confirm=true; without it you only get a preview.
 */

const GROUPS = ["kb_read", "kb_design"] as const;
const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const fail = (e: unknown) => ({ content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true });

type ProjectRow = { id: string; name: string; clients: { name: string } | { name: string }[] | null };
const labelOf = (p: ProjectRow) => `${(Array.isArray(p.clients) ? p.clients[0]?.name : p.clients?.name) ?? "?"} — ${p.name}`;

async function allProjects(): Promise<ProjectRow[]> {
  const { data, error } = await db.from("client_projects").select("id, name, clients(name)");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ProjectRow[];
}

/** Each given name must match exactly one project (by its name or "Client — Project" label). */
async function resolveProjects(names: string[]): Promise<ProjectRow[]> {
  const rows = await allProjects();
  return names.map((n) => {
    const needle = n.toLowerCase();
    const exact = rows.filter((p) => p.name.toLowerCase() === needle || labelOf(p).toLowerCase() === needle);
    const found = exact.length ? exact : rows.filter((p) => p.name.toLowerCase().includes(needle) || labelOf(p).toLowerCase().includes(needle));
    if (found.length === 0) throw new Error(`No project matches "${n}".`);
    if (found.length > 1) throw new Error(`"${n}" matches several projects: ${found.map(labelOf).join(", ")}. Be more specific.`);
    return found[0];
  });
}

export function registerMcpUserAdminTools(server: McpServer): void {
  server.registerTool(
    "mcp_user_list",
    {
      title: "MCP Users: List",
      description: "Lists the people who may connect to the restricted user MCP (/api/mcp-user): email, name, active or not, which projects and tool groups they have, and when they last connected. Read-only.",
      inputSchema: {},
      annotations: READ,
    },
    async () => {
      try {
        const [{ data: users, error }, projects] = await Promise.all([db.from("mcp_users").select("email, name, is_active, project_ids, groups, created_at, last_seen_at").order("created_at"), allProjects()]);
        if (error) throw new Error(error.message);
        const byId = new Map(projects.map((p) => [p.id, labelOf(p)]));
        if (!users?.length) return text("No MCP users yet. Add one with mcp_user_upsert.");
        return text(
          users
            .map((u) => `- ${u.email}${u.name ? ` (${u.name})` : ""} | ${u.is_active ? "active" : "DISABLED"} | groups: ${(u.groups as string[]).join(", ") || "none"} | projects: ${((u.project_ids as string[]) ?? []).map((id) => byId.get(id) ?? `?${id.slice(0, 6)}`).join("; ") || "none"} | last seen: ${u.last_seen_at ?? "never"}`)
            .join("\n")
        );
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "mcp_user_upsert",
    {
      title: "MCP Users: Add Or Change",
      description: `Adds a person to the restricted user MCP, or changes theirs. They sign in with the Google account of this email. Without confirm=true nothing is saved (preview).

Args:
  - email (string): the person's Google email.
  - name (string, optional).
  - projects (string[]): project names or "Client — Project" labels; each must match exactly one project. REPLACES the person's project list.
  - groups (string[], default ["kb_read"]): "kb_read" = read-only Knowledge Base of their projects. "kb_design" = design graphics from their chat under the project's design_guide doc: design_brief, plus saving pictures (their photo, references, finished designs) into their own project's knowledge base (kb_save_image, kb_create_upload_link). No deletes, no docs, no Planner.
  - active (boolean, default true).
  - confirm (boolean).`,
      inputSchema: {
        email: z.string().email().max(200),
        name: z.string().max(100).optional(),
        projects: z.array(z.string().min(1)).max(50),
        groups: z.array(z.enum(GROUPS)).optional(),
        active: z.boolean().optional(),
        confirm: z.boolean().optional(),
      },
      annotations: WRITE,
    },
    async ({ email, name, projects, groups, active, confirm }: { email: string; name?: string; projects: string[]; groups?: (typeof GROUPS)[number][]; active?: boolean; confirm?: boolean }) => {
      try {
        const resolved = await resolveProjects(projects);
        const row = { email: email.trim().toLowerCase(), name: name ?? null, is_active: active ?? true, project_ids: resolved.map((p) => p.id), groups: groups ?? ["kb_read"] };
        const summary = `${row.email}${name ? ` (${name})` : ""}: ${row.is_active ? "active" : "disabled"}, groups ${row.groups.join(", ")}, projects ${resolved.map(labelOf).join("; ") || "none"}`;
        if (!confirm) return text(`PREVIEW, nothing saved. Would set ${summary}. Call again with confirm=true.`);
        const { error } = await db.from("mcp_users").upsert(row, { onConflict: "email" });
        if (error) throw new Error(error.message);
        return text(`Saved. ${summary}.${row.is_active ? " They can connect with their Google account." : " Their access is off."}`);
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "mcp_user_remove",
    {
      title: "MCP Users: Remove",
      description: "Removes a person from the restricted user MCP for good: their access stops at once and their saved connections (refresh tokens) are deleted. To lock someone out but keep the record, use mcp_user_upsert with active=false instead. Args: email, confirm (must be true).",
      inputSchema: { email: z.string().email(), confirm: z.boolean().optional() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ email, confirm }: { email: string; confirm?: boolean }) => {
      try {
        const e = email.trim().toLowerCase();
        const { data } = await db.from("mcp_users").select("id").eq("email", e).maybeSingle();
        if (!data) return text(`No MCP user ${e}.`);
        if (!confirm) return text(`Not removed. This deletes ${e} and all their saved connections. Call again with confirm=true.`);
        const { error } = await db.from("mcp_users").delete().eq("id", data.id);
        if (error) throw new Error(error.message);
        return text(`Removed ${e}.`);
      } catch (err) {
        return fail(err);
      }
    }
  );
}
