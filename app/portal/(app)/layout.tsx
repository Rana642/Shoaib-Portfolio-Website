import { db } from "@/lib/dashboard/db";
import { can, requirePortalUser } from "@/lib/portal/auth";
import PortalShell, { type PortalLink } from "@/components/portal/PortalShell";
import ProjectSwitcher from "@/components/portal/ProjectSwitcher";
import { activeProject } from "@/lib/portal/active-project";

/**
 * The signed-in portal. proxy.ts already turns away anyone without the
 * client role; this re-checks (a middleware bypass must fail closed), and
 * every page below scopes its data to the signed-in user's client id and
 * checks their features.
 */
export default async function PortalAppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePortalUser();
  const { data: client } = await db.from("clients").select("name, vault_share").eq("id", ctx.clientId).maybeSingle();
  const { projects, active } = await activeProject(ctx);

  const links: PortalLink[] = [
    ...(can(ctx, "whatsapp") ? (["whatsapp"] as const) : []),
    ...(can(ctx, "wa_overview") ? (["wa_overview"] as const) : []),
    ...(can(ctx, "wa_templates") ? (["wa_templates"] as const) : []),
    ...(can(ctx, "wa_automation") ? (["wa_automation"] as const) : []),
    ...(can(ctx, "contacts") ? (["contacts"] as const) : []),
    ...(can(ctx, "bookings") ? (["bookings", "inquiries"] as const) : []),
    // Passwords: Owners only, never delegable to team members.
    ...(ctx.role === "owner" && client?.vault_share ? (["passwords"] as const) : []),
    ...(can(ctx, "planner") || can(ctx, "uploads") ? (["planner"] as const) : []),
    // Stories are view-only for clients (their uploads are photo posts).
    ...(can(ctx, "planner") ? (["stories"] as const) : []),
    ...(can(ctx, "intakes") ? (["intakes"] as const) : []),
    ...(ctx.role === "owner" && can(ctx, "team") ? (["team"] as const) : []),
  ];

  return (
    <PortalShell
      email={ctx.user.email ?? ""}
      links={client ? links : []}
      switcher={client && active && projects.length > 1 ? <ProjectSwitcher projects={projects} activeId={active.id} /> : undefined}
    >
      {client ? (
        children
      ) : (
        <p className="text-body text-ink-muted">This portal isn&apos;t active any more. If that&apos;s unexpected, get in touch with me.</p>
      )}
    </PortalShell>
  );
}
