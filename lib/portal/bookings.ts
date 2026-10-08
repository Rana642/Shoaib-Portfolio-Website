"use server";

import { db } from "@/lib/dashboard/db";
import { writeOverride } from "@/lib/booking-overrides";
import { can, canSeeProject, requirePortalUser } from "./auth";

/** Client portal: set a booking's source — only for the client's own, visible project. */
export async function portalSetBookingSource(projectId: string, bookingRef: string, source: string) {
  const ctx = await requirePortalUser();
  if (!can(ctx, "bookings") || !canSeeProject(ctx, projectId)) return { error: "You don't have access to this." };
  const { data: project } = await db.from("client_projects").select("client_id").eq("id", projectId).maybeSingle();
  if (!project || project.client_id !== ctx.clientId) return { error: "You don't have access to this." };
  return writeOverride(projectId, bookingRef, source, ctx.user.email ?? "portal");
}
