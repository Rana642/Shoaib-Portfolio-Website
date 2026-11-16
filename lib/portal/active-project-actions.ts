"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requirePortalUser } from "./auth";
import { activeProject } from "./active-project";
import { ACTIVE_PROJECT_COOKIE } from "./active-project-pick";

/** The sidebar switcher: remember which business the whole portal shows. Only one of their own is accepted. */
export async function setActiveProject(projectId: string): Promise<{ ok: true } | { error: string }> {
  const ctx = await requirePortalUser();
  const { projects } = await activeProject(ctx);
  const chosen = projects.find((p) => p.id === String(projectId));
  if (!chosen) return { error: "That business isn't yours." };
  const jar = await cookies();
  jar.set(ACTIVE_PROJECT_COOKIE, chosen.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/portal",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/portal", "layout");
  return { ok: true };
}
