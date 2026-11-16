import { redirect } from "next/navigation";
import { db } from "@/lib/dashboard/db";
import { can, requirePortalUser } from "@/lib/portal/auth";
import { activeProject } from "@/lib/portal/active-project";
import OverviewView, { OVERVIEW_PERIODS } from "@/components/whatsapp/OverviewView";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp overview" };

/** WhatsApp at a glance for the business chosen in the sidebar (only its own numbers). */
export default async function PortalWhatsAppOverviewPage({ searchParams }: { searchParams: Promise<{ days?: string; account?: string }> }) {
  const ctx = await requirePortalUser();
  if (!can(ctx, "wa_overview")) redirect("/portal");
  const { days: daysParam, account } = await searchParams;
  const days = OVERVIEW_PERIODS.includes(Number(daysParam)) ? Number(daysParam) : 30;
  const { active } = await activeProject(ctx);

  const { data: rows } = active ? await db.from("wa_accounts").select("id, label, display_phone").eq("project_id", active.id).order("created_at") : { data: [] };
  const accounts = (rows ?? []).map((a) => ({ id: a.id as string, name: (a.display_phone as string | null) ?? (a.label as string | null) ?? "WhatsApp" }));

  return (
    <OverviewView
      accounts={accounts}
      days={days}
      account={account}
      basePath="/portal/whatsapp/overview"
      inboxPath="/portal/whatsapp"
      emptyText={`No WhatsApp number is connected yet${active ? ` for ${active.name}` : ""} — I'll set it up for you.`}
    />
  );
}
