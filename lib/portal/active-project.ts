import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "@/lib/dashboard/db";
import { canSeeProject, type PortalContext } from "./auth";
import { ACTIVE_PROJECT_COOKIE, pickActive, type PortalProject } from "./active-project-pick";

export { ACTIVE_PROJECT_COOKIE };
export type { PortalProject };

const projectsOf = cache(async (clientId: string): Promise<PortalProject[]> => {
  const { data } = await db.from("client_projects").select("id, name").eq("client_id", clientId).order("sort_order");
  return (data ?? []).map((p) => ({ id: p.id as string, name: p.name as string }));
});

/**
 * The businesses of this client the signed-in person may see, and the one chosen in the sidebar
 * (a cookie; anything that isn't one of theirs is ignored, so the first one is used).
 */
export async function activeProject(ctx: PortalContext): Promise<{ projects: PortalProject[]; active: PortalProject | null }> {
  const projects = (await projectsOf(ctx.clientId)).filter((p) => canSeeProject(ctx, p.id));
  const jar = await cookies();
  return { projects, active: pickActive(projects, jar.get(ACTIVE_PROJECT_COOKIE)?.value) };
}
