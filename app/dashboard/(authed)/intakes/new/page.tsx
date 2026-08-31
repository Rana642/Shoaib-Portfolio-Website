import { db } from "@/lib/dashboard/db";
import { PageHeader } from "@/components/dashboard/ui";
import IntakeCreateForm from "@/components/dashboard/IntakeCreateForm";
import type { Client, ClientProject } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "New intake" };

export default async function NewIntakePage() {
  const [{ data: clients }, { data: projectRows }] = await Promise.all([
    db.from("clients").select("*").eq("is_active", true).order("name"),
    db.from("client_projects").select("*").order("sort_order"),
  ]);

  // Group each client's saved projects so the form can offer them as chips.
  const clientProjects: Record<string, ClientProject[]> = {};
  for (const row of (projectRows ?? []) as ClientProject[]) {
    (clientProjects[row.client_id] ??= []).push(row);
  }

  return (
    <>
      <PageHeader title="New intake" />
      <IntakeCreateForm clients={(clients ?? []) as Client[]} clientProjects={clientProjects} />
    </>
  );
}
