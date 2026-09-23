import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "./dashboard/db";
import { fetchObject } from "./storage";

/**
 * Per-project knowledge base (brand positioning, ICP, pain points, graphic
 * rules, exact product literature) — deliberately NOT surfaced anywhere in
 * the dashboard UI (Shoaib: "beshak kahen nazar na aye lakin mcp mai zaror
 * reflect ho"), only reachable through these tools. Grounds Claude in a
 * client's real business/product facts instead of guessing, so
 * caption/creative generation doesn't hallucinate composition, dosage, or
 * positioning claims — critical here since the pilot project (Tad Pharma)
 * is regulated veterinary medicine literature.
 *
 * Shared between the local stdio server (mcp/tools/knowledge.ts re-exports
 * this) and the remote OAuth server (app/api/mcp/route.ts imports it
 * directly), same pattern as lib/mcp-marketing-tools.ts.
 */

function formatError(error: unknown): string {
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}

type ProjectRow = { id: string; name: string; client_id: string; clients: { name: string } | { name: string }[] | null };

function projectLabel(p: ProjectRow): string {
  const clientName = Array.isArray(p.clients) ? p.clients[0]?.name : p.clients?.name;
  return `${clientName ?? "Unknown"} — ${p.name}`;
}

/** Fuzzy-matches a project by its own name or "Client — Project" label —
 *  same convention as the social MCP tools (findProjectByName). */
async function findProjectByName(name: string): Promise<{ id: string; label: string }> {
  const { data } = await db.from("client_projects").select("id, name, client_id, clients(name)");
  const rows = (data ?? []) as ProjectRow[];
  const needle = name.toLowerCase();
  const matches = rows.filter((p) => p.name.toLowerCase().includes(needle) || projectLabel(p).toLowerCase().includes(needle));
  if (matches.length === 0) {
    throw new Error(`No project matches "${name}".`);
  }
  if (matches.length > 1) {
    throw new Error(`"${name}" matches multiple projects: ${matches.map(projectLabel).join(", ")}. Be more specific.`);
  }
  return { id: matches[0].id, label: projectLabel(matches[0]) };
}

const DOC_TYPE_LABELS: Record<string, string> = {
  brand_position: "Brand Positioning",
  icp: "Ideal Customer Profile",
  pain_points: "Customer Pain Points",
  graphic_rules: "Graphic / Design Rules",
};

export function registerKnowledgeTools(server: McpServer): void {
  server.registerTool(
    "kb_list_projects",
    {
      title: "List Projects With A Knowledge Base",
      description: `Lists which client_projects have knowledge-base content (strategic docs and/or product literature) — use this to discover what's available before calling kb_get_brief.

Returns (JSON): { count, projects: [{ project_label, doc_count, product_count }] }`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const [{ data: docs }, { data: products }, { data: projects }] = await Promise.all([
          db.from("project_knowledge_docs").select("project_id"),
          db.from("project_products").select("project_id"),
          db.from("client_projects").select("id, name, client_id, clients(name)"),
        ]);
        const rows = (projects ?? []) as ProjectRow[];
        const labelById = new Map(rows.map((p) => [p.id, projectLabel(p)]));
        const projectIds = new Set([...(docs ?? []).map((d: { project_id: string }) => d.project_id), ...(products ?? []).map((p: { project_id: string }) => p.project_id)]);
        const result = [...projectIds].map((id) => ({
          project_label: labelById.get(id) ?? "Unknown project",
          doc_count: (docs ?? []).filter((d: { project_id: string }) => d.project_id === id).length,
          product_count: (products ?? []).filter((p: { project_id: string }) => p.project_id === id).length,
        }));
        return {
          content: [{ type: "text", text: result.map((r) => `- **${r.project_label}** — ${r.doc_count} doc(s), ${r.product_count} product(s)`).join("\n") || "No knowledge base content yet." }],
          structuredContent: { count: result.length, projects: result },
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "kb_get_brief",
    {
      title: "Get Project Knowledge Brief",
      description: `Fetches a project's full strategic knowledge base — brand positioning, ideal customer profile, pain points, and graphic/design rules — plus a list of its products. Read this BEFORE writing any caption, ad copy, or generation prompt for this project, so claims/tone/design stay grounded in real facts instead of being guessed.

Args:
  - projectName (string): fuzzy-matched against the project name or "Client — Project" label.

Returns: the combined markdown of every knowledge doc set for this project, plus the product list (use kb_get_product for one product's exact literature).`,
      inputSchema: { projectName: z.string() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ projectName }: { projectName: string }) => {
      try {
        const project = await findProjectByName(projectName);
        const [{ data: docs }, { data: products }] = await Promise.all([
          db.from("project_knowledge_docs").select("doc_type, title, content").eq("project_id", project.id),
          db.from("project_products").select("name, slug, category").eq("project_id", project.id).order("name"),
        ]);
        const docRows = (docs ?? []) as { doc_type: string; title: string; content: string }[];
        const order = ["brand_position", "icp", "pain_points", "graphic_rules"];
        docRows.sort((a, b) => order.indexOf(a.doc_type) - order.indexOf(b.doc_type));
        const lines = [`# Knowledge base — ${project.label}`, ""];
        if (docRows.length === 0) lines.push("_No strategic docs set for this project yet._", "");
        for (const d of docRows) {
          lines.push(d.content, "", "---", "");
        }
        const productRows = (products ?? []) as { name: string; slug: string; category: string | null }[];
        lines.push(`## Products (${productRows.length})`, "");
        for (const p of productRows) {
          lines.push(`- **${p.name}** (\`${p.slug}\`)${p.category ? ` — ${p.category}` : ""}`);
        }
        if (productRows.length > 0) lines.push("", "Use kb_get_product for one product's exact composition/dosage/indications.");
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: {
            project: project.label,
            docs: docRows.map((d) => ({ doc_type: d.doc_type, title: DOC_TYPE_LABELS[d.doc_type] ?? d.title })),
            products: productRows,
          },
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "kb_list_products",
    {
      title: "List Project Products",
      description: `Lists a project's products from the knowledge base (name, slug, category).

Args:
  - projectName (string): fuzzy-matched.

Returns (JSON): { count, products: [{ name, slug, category }] }`,
      inputSchema: { projectName: z.string() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ projectName }: { projectName: string }) => {
      try {
        const project = await findProjectByName(projectName);
        const { data } = await db.from("project_products").select("name, slug, category").eq("project_id", project.id).order("name");
        const rows = (data ?? []) as { name: string; slug: string; category: string | null }[];
        return {
          content: [{ type: "text", text: rows.map((r) => `- **${r.name}** (\`${r.slug}\`)${r.category ? ` — ${r.category}` : ""}`).join("\n") || "No products yet." }],
          structuredContent: { count: rows.length, products: rows },
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "kb_get_product",
    {
      title: "Get Product Literature",
      description: `Fetches one product's EXACT literature (composition, indications, dosage, packing) — the ground truth to quote from, never approximate or invent a number here. Also returns the finished-product photo if one was uploaded, so it can be used as a reference image for generation.

Args:
  - projectName (string): fuzzy-matched against the project.
  - productName (string): fuzzy-matched against the product name or slug.

Returns: the product's markdown content, plus its photo (view directly) if available.`,
      inputSchema: { projectName: z.string(), productName: z.string() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ projectName, productName }: { projectName: string; productName: string }) => {
      try {
        const project = await findProjectByName(projectName);
        const { data } = await db.from("project_products").select("name, slug, content, image_key").eq("project_id", project.id);
        const rows = (data ?? []) as { name: string; slug: string; content: string; image_key: string | null }[];
        const needle = productName.toLowerCase();
        const matches = rows.filter((r) => r.name.toLowerCase().includes(needle) || r.slug.includes(needle));
        if (matches.length === 0) throw new Error(`No product matches "${productName}" in ${project.label}.`);
        if (matches.length > 1) throw new Error(`"${productName}" matches multiple products: ${matches.map((r) => r.name).join(", ")}. Be more specific.`);
        const product = matches[0];
        const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [
          { type: "text", text: product.content },
        ];
        if (product.image_key) {
          try {
            const { buffer, contentType } = await fetchObject(product.image_key);
            content.push({ type: "image", data: buffer.toString("base64"), mimeType: contentType });
          } catch {
            // Image missing from storage — literature text still returned.
          }
        }
        return { content };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );
}
