import "server-only";
import { db } from "./db";
import type { ProjectOption } from "./types";

type RawProjectRow = {
  id: string;
  client_id: string;
  name: string;
  clients: { name: string } | { name: string }[] | null;
};

/** Every client_projects row flattened to a "Client — Project" label, for
 *  the project pickers across /dashboard/social. */
export async function listProjectOptions(): Promise<ProjectOption[]> {
  const { data } = await db.from("client_projects").select("id, client_id, name, clients(name)").order("name");
  return ((data ?? []) as RawProjectRow[]).map((p) => {
    const clientName = Array.isArray(p.clients) ? p.clients[0]?.name : p.clients?.name;
    return { id: p.id, client_id: p.client_id, label: `${clientName ?? "Unknown"} — ${p.name}` };
  });
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
