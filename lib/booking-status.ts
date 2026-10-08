/** Hotel booking statuses — labels and badge colours, same order as the hotel admins. */
export const BOOKING_STATUSES = [
  { key: "pending", label: "Pending", cls: "bg-citrus/25 text-ink" },
  { key: "confirmed", label: "Confirmed", cls: "bg-cobalt/15 text-ink" },
  { key: "checked_in", label: "Checked In", cls: "bg-forest/15 text-ink" },
  { key: "completed", label: "Completed", cls: "bg-green-500/15 text-green-800" },
  { key: "cancelled", label: "Cancelled", cls: "bg-red-500/10 text-red-700" },
  { key: "no_show", label: "No Show", cls: "bg-ink/10 text-ink-muted" },
  { key: "unreachable", label: "Unreachable", cls: "bg-ink/10 text-ink-muted" },
] as const;

const BY_KEY = new Map<string, { label: string; cls: string }>(BOOKING_STATUSES.map((s) => [s.key, s]));

export function statusLook(key: string) {
  return BY_KEY.get(key) ?? { label: key.replace(/_/g, " "), cls: "bg-ink/10 text-ink-muted" };
}
