import "server-only";
import { db } from "@/lib/dashboard/db";
import { requestKeyLabel } from "@/lib/vault-platforms";

export type AccountStatus = "requested" | "received" | "secured";

export type AccountRow = {
  key: string;
  label: string;
  status: AccountStatus;
  date: string;
  note: string | null;
};

export type AccountSection = {
  /** null = not tied to a project ("General"). */
  projectId: string | null;
  name: string;
  rows: AccountRow[];
};

const ORDER: Record<AccountStatus, number> = { requested: 0, received: 1, secured: 2 };

/**
 * What a client sees about their accounts: what I've asked for, what they
 * sent, and what I've secured — platform names and dates only. Everything
 * is scoped to `clientId`, which callers take from the signed-in session.
 */
export async function portalAccountSections(clientId: string): Promise<AccountSection[]> {
  const [{ data: projects }, { data: submissions }, { data: requests }] = await Promise.all([
    db.from("client_projects").select("id, name").eq("client_id", clientId).order("sort_order"),
    db
      .from("vault_submissions")
      .select("project_id, platforms, status, created_at, imported_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
    db.from("vault_requests").select("project_id, platform, note, created_at").eq("client_id", clientId).is("fulfilled_at", null),
  ]);

  const sections: AccountSection[] = [
    ...(projects ?? []).map((p) => ({ projectId: p.id as string, name: p.name as string, rows: [] as AccountRow[] })),
    { projectId: null, name: (projects ?? []).length ? "General" : "Your accounts", rows: [] },
  ];
  const sectionFor = (projectId: string | null) =>
    sections.find((s) => s.projectId === projectId) ?? sections[sections.length - 1];

  for (const r of requests ?? []) {
    sectionFor(r.project_id).rows.push({
      key: r.platform,
      label: requestKeyLabel(r.platform),
      status: "requested",
      date: r.created_at,
      note: r.note,
    });
  }
  for (const s of submissions ?? []) {
    for (const key of s.platforms as string[]) {
      sectionFor(s.project_id).rows.push({
        key,
        label: requestKeyLabel(key),
        status: s.status === "imported" ? "secured" : "received",
        date: s.status === "imported" && s.imported_at ? s.imported_at : s.created_at,
        note: null,
      });
    }
  }
  for (const section of sections) {
    section.rows.sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.date.localeCompare(a.date));
  }
  // Projects always show (so there's somewhere to send from); "General"
  // only when it has something, or when there are no projects at all.
  return sections.filter((s) => s.projectId !== null || s.rows.length > 0 || sections.length === 1);
}
