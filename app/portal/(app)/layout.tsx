import { db } from "@/lib/dashboard/db";
import { can, requirePortalUser } from "@/lib/portal/auth";
import PortalShell, { type PortalLink } from "@/components/portal/PortalShell";

/**
 * The signed-in portal. proxy.ts already turns away anyone without the
 * client role; this re-checks (a middleware bypass must fail closed), and
 * every page below scopes its data to the signed-in user's client id and
 * checks their features.
 */
export default async function PortalAppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePortalUser();
  const { data: client } = await db.from("clients").select("name, vault_share").eq("id", ctx.clientId).maybeSingle();

  const links: PortalLink[] = [
    ...(can(ctx, "whatsapp") ? (["whatsapp"] as const) : []),
    ...(can(ctx, "bookings") ? (["bookings"] as const) : []),
    // Passwords: Owners only, never delegable to team members.
    ...(ctx.role === "owner" && client?.vault_share ? (["passwords"] as const) : []),
    ...(can(ctx, "planner") || can(ctx, "uploads") ? (["planner"] as const) : []),
    ...(can(ctx, "intakes") ? (["intakes"] as const) : []),
    ...(ctx.role === "owner" && can(ctx, "team") ? (["team"] as const) : []),
  ];

  return (
    <PortalShell email={ctx.user.email ?? ""} links={client ? links : []}>
      {client ? (
        children
      ) : (
        <p className="text-body text-ink-muted">This portal isn&apos;t active any more. If that&apos;s unexpected, get in touch with me.</p>
      )}
    </PortalShell>
  );
}
