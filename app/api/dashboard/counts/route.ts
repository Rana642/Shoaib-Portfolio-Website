import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/dashboard/auth";
import { db } from "@/lib/dashboard/db";
import { todayPk } from "@/lib/finance";
import { brokenConnections } from "@/lib/connection-health";

/**
 * What needs Shoaib's attention, per sidebar section — head-only counts, so
 * it's cheap enough for the sidebar to poll. Leads have no status, so the
 * newest timestamps come back instead and the browser counts the ones newer
 * than the last visit to Leads.
 */
export async function GET() {
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = todayPk();
  const head = { count: "exact" as const, head: true };
  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: n, error } = await q;
    return error ? 0 : (n ?? 0);
  };

  const [receipts, overdueInvoices, lateInvoices, dueBills, unreadChats, postsToCaption, failedPosts, submissions, leads, broken] = await Promise.all([
    count(db.from("payment_receipts").select("id", head).eq("status", "pending")),
    count(db.from("invoices").select("id", head).eq("status", "overdue")),
    count(db.from("invoices").select("id", head).in("status", ["sent", "partially_paid"]).lt("due_date", today)),
    count(db.from("finance_bills").select("id", head).eq("is_active", true).lte("next_due", today)),
    count(db.from("wa_contacts").select("id", head).gt("unread", 0)),
    count(db.from("scheduled_posts").select("id", head).eq("status", "pending_caption")),
    count(db.from("scheduled_posts").select("id", head).eq("status", "failed")),
    count(db.from("vault_submissions").select("id", head).eq("status", "received")),
    db.from("contacts").select("created_at").order("created_at", { ascending: false }).limit(50),
    // Broken logins (red badge on Socially Snap → Settings); cached a minute in the lib.
    brokenConnections().catch(() => []),
  ]);

  return NextResponse.json(
    {
      finance: receipts + overdueInvoices + lateInvoices + dueBills,
      whatsapp: unreadChats,
      planner: postsToCaption + failedPosts,
      clients: submissions,
      integrations: broken.length,
      leadTimes: ((leads.data ?? []) as { created_at: string }[]).map((l) => l.created_at),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
