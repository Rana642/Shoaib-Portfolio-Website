import "server-only";
import { db } from "./db";
import type { ProjectOption } from "./types";

type RawProjectRow = {
  id: string;
  client_id: string;
  name: string;
  clients: { name: string } | { name: string }[] | null;
};

/** Every client_projects row for the project pickers across the dashboard.
 *  The label is just the project name; the client is added ("Project ·
 *  Client") only to tell two same-named projects apart. */
export async function listProjectOptions(): Promise<ProjectOption[]> {
  const { data } = await db.from("client_projects").select("id, client_id, name, clients(name)").order("name");
  const rows = ((data ?? []) as RawProjectRow[]).map((p) => ({
    id: p.id,
    client_id: p.client_id,
    name: p.name,
    client: (Array.isArray(p.clients) ? p.clients[0]?.name : p.clients?.name) ?? "Unknown",
  }));
  const count = new Map<string, number>();
  for (const r of rows) count.set(r.name.toLowerCase(), (count.get(r.name.toLowerCase()) ?? 0) + 1);
  return rows.map((r) => ({ ...r, label: (count.get(r.name.toLowerCase()) ?? 0) > 1 ? `${r.name} · ${r.client}` : r.name }));
}

/** Active clients with zero client_projects rows — they can't use the
 *  social poster until a project is added on their client page. */
export async function listClientsMissingProject(): Promise<{ id: string; name: string }[]> {
  const [{ data: clients }, projects] = await Promise.all([
    db.from("clients").select("id, name").eq("is_active", true),
    listProjectOptions(),
  ]);
  const projectClientIds = new Set(projects.map((p) => p.client_id));
  return ((clients ?? []) as { id: string; name: string }[]).filter((c) => !projectClientIds.has(c.id));
}
