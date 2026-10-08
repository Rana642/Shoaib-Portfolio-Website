"use server";

import { redirect } from "next/navigation";
import { getAdminUser } from "../auth";
import { revalidatePath, updateTag } from "next/cache";
import { writeOverride } from "../../booking-overrides";
import { bookingsTag, saveHotelBookingNotes, setHotelBookingStatus } from "../../hotel-bookings";

/** My dashboard: set where a code-less booking came from ("" clears it). */
export async function setBookingSource(projectId: string, bookingRef: string, source: string) {
  if (!(await getAdminUser())) redirect("/dashboard/login");
  return writeOverride(projectId, bookingRef, source, "admin");
}

export async function setHotelStatusAdmin(projectId: string, bookingId: string, status: string) {
  const user = await getAdminUser();
  if (!user) redirect("/dashboard/login");
  const res = await setHotelBookingStatus(projectId, bookingId, status, user.email ?? "admin");
  updateTag(bookingsTag(projectId));
  revalidatePath("/dashboard/bookings", "layout");
  return res;
}

export async function saveHotelNotesAdmin(projectId: string, bookingId: string, notes: string) {
  const user = await getAdminUser();
  if (!user) redirect("/dashboard/login");
  return saveHotelBookingNotes(projectId, bookingId, notes, user.email ?? "admin");
}
