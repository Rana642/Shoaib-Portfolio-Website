/** Source choices for bookings that arrived without an ad code (phone, walk-in…). */
export const MANUAL_SOURCES = [
  { value: "FB", label: "Facebook / Instagram" },
  { value: "GA", label: "Google ad" },
  { value: "GS", label: "Google search / Maps" },
  { value: "OTA", label: "Booking.com / OTA" },
  { value: "REF", label: "Referral / repeat guest" },
  { value: "WALKIN", label: "Walk-in" },
  { value: "OTHER", label: "Other" },
] as const;

export const MANUAL_SOURCE_VALUES: string[] = MANUAL_SOURCES.map((s) => s.value);
