import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/dashboard/db";
import { can, requirePortalUser } from "@/lib/portal/auth";
import { activeProject } from "@/lib/portal/active-project";
import { portalAddQuickReply, portalDeleteQuickReply, portalSaveAutomation } from "@/lib/portal/wa-tools";
import { Card, PageHeader } from "@/components/dashboard/ui";
import { AutomationForm, QuickRepliesManager } from "@/components/whatsapp/AutomationForm";
import { withDefaults, type AutomationSettings } from "@/lib/whatsapp/automation-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp automation" };

/** Automatic replies and quick replies for the numbers of the business chosen in the sidebar. */
export default async function PortalWhatsAppAutomationPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const ctx = await requirePortalUser();
  if (!can(ctx, "wa_automation")) redirect("/portal");
  const { account } = await searchParams;
  const { active } = await activeProject(ctx);

  const { data: rows } = active
    ? await db.from("wa_accounts").select("id, label, display_phone, automation").eq("project_id", active.id).order("created_at")
    : { data: [] };
  const accounts = (rows ?? []) as { id: string; label: string | null; display_phone: string | null; automation: Partial<AutomationSettings> | null }[];
  const selected = accounts.find((a) => a.id === account) ?? accounts[0];
  const { data: quick } = selected
    ? await db.from("wa_quick_replies").select("id, title, body").eq("account_id", selected.id).order("sort_order")
    : { data: [] };
  const name = (a: (typeof accounts)[number]) => a.display_phone ?? a.label ?? "WhatsApp";
  const initial: AutomationSettings = withDefaults(selected?.automation);

  async function save(s: AutomationSettings) {
    "use server";
    return portalSaveAutomation(selected!.id, s);
  }
  async function add(title: string, body: string) {
    "use server";
    return portalAddQuickReply(selected!.id, title, body);
  }

  return (
    <>
      <PageHeader title="WhatsApp automation" description="Automatic replies per number. Everything is off until you write the message and switch it on." />
      {!selected ? (
        <Card className="p-6">
          <p className="text-small text-ink-muted">No WhatsApp number is connected yet{active ? ` for ${active.name}` : ""} — I&apos;ll set it up for you.</p>
        </Card>
      ) : (
        <>
          {accounts.length > 1 && (
            <nav className="flex flex-wrap gap-2 mb-4 text-small">
              {accounts.map((a) => (
                <Link
                  key={a.id}
                  href={`/portal/whatsapp/automation?account=${a.id}`}
                  className={`rounded-lg border px-3 py-1.5 ${a.id === selected.id ? "border-ink bg-ink text-cloud" : "border-ink/15 hover:bg-ink/5"}`}
                >
                  {name(a)}
                </Link>
              ))}
            </nav>
          )}
          <div className="grid gap-6 lg:grid-cols-[1fr_380px] items-start">
            <AutomationForm key={selected.id} initial={initial} onSave={save} />
            <QuickRepliesManager items={quick ?? []} onAdd={add} onDelete={portalDeleteQuickReply} />
          </div>
        </>
      )}
    </>
  );
}
