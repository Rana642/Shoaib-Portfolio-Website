import { db } from "@/lib/dashboard/db";
import OverviewView, { OVERVIEW_PERIODS } from "@/components/whatsapp/OverviewView";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp overview" };

/** WhatsApp at a glance across every number (the portal shows the same view for one client's own numbers). */
export default async function WhatsAppOverviewPage({ searchParams }: { searchParams: Promise<{ days?: string; account?: string }> }) {
  const { days: daysParam, account } = await searchParams;
  const days = OVERVIEW_PERIODS.includes(Number(daysParam)) ? Number(daysParam) : 30;

  const { data: rows } = await db.from("wa_accounts").select("id, label, display_phone, client_projects(name)").order("created_at");
  const accounts = ((rows ?? []) as unknown as { id: string; label: string | null; display_phone: string | null; client_projects: { name: string } | null }[]).map(
    (a) => ({ id: a.id, name: a.client_projects?.name ?? a.label ?? a.display_phone ?? "WhatsApp" })
  );

  return (
    <OverviewView
      accounts={accounts}
      days={days}
      account={account}
      basePath="/dashboard/whatsapp/overview"
      inboxPath="/dashboard/whatsapp"
      broadcastsPath="/dashboard/whatsapp/broadcasts"
      emptyText="No WhatsApp number connected yet — connect one under Numbers."
    />
  );
}
