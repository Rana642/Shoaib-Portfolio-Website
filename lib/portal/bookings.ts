"use server";

import { db } from "@/lib/dashboard/db";
import { revalidatePath, updateTag } from "next/cache";
import { writeOverride } from "@/lib/booking-overrides";
import { bookingsTag, saveHotelBookingNotes, setHotelBookingStatus } from "@/lib/hotel-bookings";
import { setHotelInquiryStatus } from "@/lib/hotel-crm";
import { can, canSeeProject, requirePortalUser } from "./auth";

/** Client portal: set a booking's source — only for the client's own, visible project. */
/** The signed-in portal user, if they may manage this project's bookings. */
async function bookingAccess(projectId: string) {
  const ctx = await requirePortalUser();
  if (!can(ctx, "bookings") || !canSeeProject(ctx, projectId)) return null;
  const { data: project } = await db.from("client_projects").select("client_id").eq("id", projectId).maybeSingle();
  return project && project.client_id === ctx.clientId ? ctx : null;
}

export async function portalSetBookingSource(projectId: string, bookingRef: string, source: string) {
  const ctx = await bookingAccess(projectId);
  if (!ctx) return { error: "You don't have access to this." };
  return writeOverride(projectId, bookingRef, source, ctx.user.email ?? "portal");
}

export async function portalSetBookingStatus(projectId: string, bookingId: string, status: string) {
  const ctx = await bookingAccess(projectId);
  if (!ctx) return { error: "You don't have access to this." };
  const res = await setHotelBookingStatus(projectId, bookingId, status, ctx.user.email ?? "portal");
  updateTag(bookingsTag(projectId));
  revalidatePath("/portal/bookings", "layout");
  return res;
}

export async function portalSaveBookingNotes(projectId: string, bookingId: string, notes: string) {
  const ctx = await bookingAccess(projectId);
  if (!ctx) return { error: "You don't have access to this." };
  return saveHotelBookingNotes(projectId, bookingId, notes, ctx.user.email ?? "portal");
}

export async function portalSetInquiryStatus(projectId: string, id: string, status: string) {
  const ctx = await bookingAccess(projectId);
  if (!ctx) return { error: "You don't have access to this." };
  const res = await setHotelInquiryStatus(projectId, id, status, ctx.user.email ?? "portal");
  revalidatePath("/portal/inquiries");
  return res;
}
