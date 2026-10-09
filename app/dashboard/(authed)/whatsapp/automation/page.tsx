import Link from "next/link";
import { db } from "@/lib/dashboard/db";
import { Card, PageHeader } from "@/components/dashboard/ui";
import { AutomationForm, QuickRepliesManager, type AutomationSettings } from "@/components/whatsapp/AutomationForm";
import { addQuickReply, deleteQuickReply, saveWhatsAppAutomation } from "@/lib/dashboard/actions/whatsapp";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp automation" };

const DEFAULTS: AutomationSettings = {
  instant: { on: false, delayMin: 2, text: "" },
  afterHours: { on: false, from: "23:00", to: "08:00", text: "" },
  followUp: { on: false, afterHours: 3, text: "" },
};

export default async function WhatsAppAutomationPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const { account } = await searchParams;
  const { data: rows } = await db.from("wa_accounts").select("id, label, display_phone, automation, client_projects(name)").order("created_at");
  const accounts = (rows ?? []) as unknown as {
    id: string;
    label: string | null;
    display_phone: string | null;
    automation: Partial<AutomationSettings> | null;
    client_projects: { name: string } | null;
  }[];
  const selected = accounts.find((a) => a.id === account) ?? accounts[0];
  const { data: quick } = selected
    ? await db.from("wa_quick_replies").select("id, title, body").eq("account_id", selected.id).order("sort_order")
    : { data: [] };
  const name = (a: (typeof accounts)[number]) => a.client_projects?.name ?? a.label ?? a.display_phone ?? "WhatsApp";
  const initial: AutomationSettings = {
    instant: { ...DEFAULTS.instant, ...(selected?.automation?.instant ?? {}) },
    afterHours: { ...DEFAULTS.afterHours, ...(selected?.automation?.afterHours ?? {}) },
    followUp: { ...DEFAULTS.followUp, ...(selected?.automation?.followUp ?? {}) },
  };

  async function save(s: AutomationSettings) {
    "use server";
    return saveWhatsAppAutomation(selected!.id, s);
  }
  async function add(title: string, body: string) {
    "use server";
    return addQuickReply(selected!.id, title, body);
  }

  return (
    <>
      <PageHeader title="WhatsApp automation" description="Automatic replies per number. Everything is off until you write the message and switch it on." />
      {!selected ? (
        <Card className="p-6">
          <p className="text-small text-ink-muted">No WhatsApp number connected yet.</p>
        </Card>
      ) : (
        <>
          {accounts.length > 1 && (
            <nav className="flex flex-wrap gap-2 mb-4 text-small">
              {accounts.map((a) => (
                <Link
                  key={a.id}
                  href={`/dashboard/whatsapp/automation?account=${a.id}`}
                  className={`rounded-lg border px-3 py-1.5 ${a.id === selected.id ? "border-ink bg-ink text-cloud" : "border-ink/15 hover:bg-ink/5"}`}
                >
                  {name(a)}
                </Link>
              ))}
            </nav>
          )}
          <div className="grid gap-6 lg:grid-cols-[1fr_380px] items-start">
            <AutomationForm key={selected.id} initial={initial} onSave={save} />
            <QuickRepliesManager items={quick ?? []} onAdd={add} onDelete={deleteQuickReply} />
          </div>
        </>
      )}
    </>
  );
}
