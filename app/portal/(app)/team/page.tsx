import { redirect } from "next/navigation";
import { db } from "@/lib/dashboard/db";
import { can, requirePortalUser } from "@/lib/portal/auth";
import { listPortalMembers } from "@/lib/dashboard/portal-users";
import TeamManager from "@/components/portal/TeamManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team" };

/** An Owner's team: people from their organisation who work in the portal
 *  on their behalf, each with some of the Owner's own features. */
export default async function PortalTeamPage() {
  const ctx = await requirePortalUser();
  if (ctx.role !== "owner" || !can(ctx, "team")) redirect("/portal");

  const [{ members }, { data: projects }] = await Promise.all([
    listPortalMembers(ctx.clientId),
    db.from("client_projects").select("id, name").eq("client_id", ctx.clientId).order("sort_order"),
  ]);

  return (
    <>
      <h1 className="font-serif italic text-h2">Team</h1>
      <p className="text-body text-ink-muted mt-2 max-w-2xl">
        Add people from your organisation to work here on your behalf — for example a designer who uploads graphics, or a
        manager who fills in forms. You choose what each of them can do and which projects they see.
      </p>
      <TeamManager
        me={ctx.user.id}
        members={members.map((m) => ({
          id: m.id,
          userId: m.userId,
          email: m.email,
          role: m.role,
          permissions: m.permissions,
          projectIds: m.projectIds,
          active: Boolean(m.lastSignInAt),
        }))}
        grantable={ctx.features.filter((f) => f !== "team")}
        projects={(projects ?? []).map((p) => ({ id: p.id as string, name: p.name as string }))}
      />
    </>
  );
}
