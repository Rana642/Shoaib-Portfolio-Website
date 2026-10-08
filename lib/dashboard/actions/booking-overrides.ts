"use server";

import { redirect } from "next/navigation";
import { getAdminUser } from "../auth";
import { writeOverride } from "../../booking-overrides";

/** My dashboard: set where a code-less booking came from ("" clears it). */
export async function setBookingSource(projectId: string, bookingRef: string, source: string) {
  if (!(await getAdminUser())) redirect("/dashboard/login");
  return writeOverride(projectId, bookingRef, source, "admin");
}
