import { getPortalUser, can } from "@/lib/portal/auth";
import { activeProject } from "@/lib/portal/active-project";
import { allContacts } from "@/lib/portal/contacts";
import { csvCell, SOURCE_LABEL, type ContactSource } from "@/lib/portal/contacts-merge";

export const dynamic = "force-dynamic";

/** The signed-in person's contact book (the business chosen in the sidebar) as a CSV file. */
export async function GET() {
  const ctx = await getPortalUser();
  if (!ctx || !can(ctx, "contacts")) return new Response("Not allowed", { status: 403 });
  const { active } = await activeProject(ctx);
  if (!active) return new Response("No business", { status: 404 });

  const rows = await allContacts(active.id);
  const head = ["Name", "Phone", "Email", "Where from", "Bookings", "Inquiries", "WhatsApp chats", "Total spent (PKR)", "First seen", "Last activity", "Note"];
  const lines = [head.map(csvCell).join(",")];
  for (const c of rows) {
    lines.push(
      [
        c.name,
        c.phone,
        c.email,
        c.sources.map((s) => SOURCE_LABEL[s as ContactSource] ?? s).join(" + "),
        c.bookings,
        c.inquiries,
        c.chats,
        Math.round(Number(c.total_spent) || 0),
        c.first_seen_at?.slice(0, 10),
        c.last_activity_at?.slice(0, 10),
        c.notes,
      ]
        .map(csvCell)
        .join(",")
    );
  }
  const file = `${active.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-contacts.csv`;
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
