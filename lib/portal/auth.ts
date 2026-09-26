import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createAuthClient } from "@/lib/dashboard/auth";
import { portalClientId } from "@/lib/dashboard/roles";
import { getClientFeatures, loadPortalMember } from "@/lib/dashboard/portal-users";
import { effectiveFeatures, type PortalFeature, type PortalRole } from "./features";

export type PortalContext = {
  user: User;
  clientId: string;
  memberId: string;
  role: PortalRole;
  /** What they can do right now (see lib/portal/features.ts). */
  features: PortalFeature[];
  /** null = every project of the client (Owners always). */
  projectIds: string[] | null;
};

/**
 * The signed-in client-portal user, their client, and what they may do —
 * or null. Every portal page and action scopes its queries to `clientId`
 * and checks `features` / `projectIds` from here, never anything sent by
 * the browser. A login without a membership row gets nothing.
 */
export async function getPortalUser(): Promise<PortalContext | null> {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const clientId = portalClientId(user);
  if (!user || !clientId) return null;

  const member = await loadPortalMember(user.id);
  if (!member) return null;
  const clientFeatures = await getClientFeatures(clientId);
  return {
    user,
    clientId,
    memberId: member.id,
    role: member.role,
    features: effectiveFeatures(member.role, clientFeatures, member.permissions),
    projectIds: member.role === "owner" ? null : member.projectIds,
  };
}

/** For portal pages/actions: the portal user, or off to the portal login. */
export async function requirePortalUser(): Promise<PortalContext> {
  const portalUser = await getPortalUser();
  if (!portalUser) redirect("/portal/login");
  return portalUser;
}

export function can(ctx: PortalContext, feature: PortalFeature): boolean {
  return ctx.features.includes(feature);
}

/** Whether a project (null = the client's general, project-less items) is
 *  within someone's reach. Project-limited members never see "general". */
export function canSeeProject(ctx: PortalContext, projectId: string | null): boolean {
  if (ctx.projectIds === null) return true;
  return projectId !== null && ctx.projectIds.includes(projectId);
}

/** A portal page that needs a feature: without it, back to portal home. */
export async function requirePortalFeature(feature: PortalFeature): Promise<PortalContext> {
  const ctx = await requirePortalUser();
  if (!can(ctx, feature)) redirect("/portal");
  return ctx;
}
