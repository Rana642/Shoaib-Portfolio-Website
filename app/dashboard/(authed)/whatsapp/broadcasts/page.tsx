import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { Card, PageHeader } from "@/components/dashboard/ui";
import BroadcastForm, { CancelBroadcastButton } from "@/components/whatsapp/BroadcastForm";
import { cancelWhatsAppBroadcast, createWhatsAppBroadcast, previewWhatsAppBroadcast } from "@/lib/dashboard/actions/whatsapp";
import { listTemplates } from "@/lib/whatsapp-templates";
import type { Audience } from "@/lib/whatsapp-broadcasts";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp broadcasts" };

type Stats = { broadcast_id: string; queued: number; sent: number; delivered: number; read: number; failed: number; skipped: number; replied: number };

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

/** Send one approved template to a filtered list of a number's contacts, and see how each broadcast did. */
export default async function WhatsAppBroadcastsPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const { account } = await searchParams;
  const { data: rows } = await db.from("wa_accounts").select("id, label, display_phone, client_projects(name)").order("created_at");
  const accounts = (rows ?? []) as unknown as {
    id: string;
    label: string | null;
    display_phone: string | null;
    client_projects: { name: string } | null;
  }[];
  const selected = accounts.find((a) => a.id === account) ?? accounts[0];
  const name = (a: (typeof accounts)[number]) => a.client_projects?.name ?? a.label ?? a.display_phone ?? "WhatsApp";

  let templates: Awaited<ReturnType<typeof listTemplates>> = [];
  let loadError: string | null = null;
  const [{ data: tagRows }, { data: broadcasts }] = selected
    ? await Promise.all([
        db.from("wa_contacts").select("tags").eq("account_id", selected.id).neq("tags", "{}").limit(2000),
        db
          .from("wa_broadcasts")
          .select("id, name, template, status, scheduled_at, created_at, finished_at, total")
          .eq("account_id", selected.id)
          .order("created_at", { ascending: false })
          .limit(30),
      ])
    : [{ data: [] }, { data: [] }];
  if (selected) {
    try {
      templates = await listTemplates(selected.id, true);
    } catch (e) {
      loadError = e instanceof Error ? e.message : "Couldn't load templates.";
    }
  }
  const tags = [...new Set((tagRows ?? []).flatMap((r) => (r.tags as string[]) ?? []))].sort();
  const ids = (broadcasts ?? []).map((b) => b.id as string);
  const { data: statRows } = ids.length ? await db.rpc("wa_broadcast_stats", { ids }) : { data: [] };
  const stats = new Map(((statRows ?? []) as Stats[]).map((s) => [s.broadcast_id, s]));

  async function preview(audience: Audience, category: string) {
    "use server";
    return previewWhatsAppBroadcast(selected!.id, audience, category);
  }
  async function create(input: {
    name: string;
    templateName: string;
    templateLanguage: string;
    params: string[];
    audience: Audience;
    scheduledAt: string | null;
  }) {
    "use server";
    return createWhatsAppBroadcast({ ...input, accountId: selected!.id });
  }

  return (
    <>
      <Link href="/dashboard/whatsapp" className="inline-flex items-center gap-1.5 text-small text-ink-subtle hover:text-ink mb-4">
        <ArrowLeft className="size-4" aria-hidden /> Inbox
      </Link>
      <PageHeader
        title="WhatsApp broadcasts"
        description="Send one approved template to many customers. It goes out in small batches every minute to keep the number's quality safe."
      />
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
                  href={`/dashboard/whatsapp/broadcasts?account=${a.id}`}
                  className={`rounded-lg border px-3 py-1.5 ${a.id === selected.id ? "border-ink bg-ink text-cloud" : "border-ink/15 hover:bg-ink/5"}`}
                >
                  {name(a)}
                </Link>
              ))}
            </nav>
          )}

          <Card className="p-6 mb-6">
            <h2 className="text-body-lg font-medium mb-5">
              New broadcast <span className="text-ink-subtle font-normal">· {name(selected)}</span>
            </h2>
            {loadError ? (
              <p className="text-small text-red-700">{loadError}</p>
            ) : (
              <BroadcastForm key={selected.id} templates={templates} tags={tags} onPreview={preview} onCreate={create} />
            )}
          </Card>

          <Card className="p-6">
            <h2 className="text-body-lg font-medium mb-4">Past broadcasts</h2>
            {!broadcasts?.length ? (
              <p className="text-small text-ink-muted">None yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-small min-w-[760px]">
                  <thead>
                    <tr className="text-left text-ink-muted border-b border-ink/10">
                      <th className="py-2 font-normal">Broadcast</th>
                      <th className="py-2 font-normal">When</th>
                      <th className="py-2 font-normal">Status</th>
                      {["Contacts", "Sent", "Delivered", "Read", "Replied", "Failed"].map((h) => (
                        <th key={h} className="py-2 font-normal text-right">
                          {h}
                        </th>
                      ))}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {broadcasts.map((b) => {
                      const s = stats.get(b.id as string);
                      const tpl = b.template as { name?: string };
                      const live = b.status === "scheduled" || b.status === "sending";
                      async function cancel() {
                        "use server";
                        return cancelWhatsAppBroadcast(b.id as string);
                      }
                      return (
                        <tr key={b.id as string} className="border-b border-ink/5">
                          <td className="py-3 pr-3">
                            <span className="font-medium">{b.name as string}</span>
                            <span className="block text-tag text-ink-subtle">{tpl.name}</span>
                          </td>
                          <td className="py-3 pr-3 whitespace-nowrap">{time(b.scheduled_at as string)}</td>
                          <td className="py-3 pr-3">
                            <span className="font-mono uppercase text-tag tracking-wide">{b.status as string}</span>
                            {b.status === "sending" && s && <span className="block text-tag text-ink-subtle">{s.queued} left</span>}
                          </td>
                          <td className="py-3 text-right tabular-nums">{b.total as number}</td>
                          <td className="py-3 text-right tabular-nums">{s?.sent ?? 0}</td>
                          <td className="py-3 text-right tabular-nums">{s?.delivered ?? 0}</td>
                          <td className="py-3 text-right tabular-nums">{s?.read ?? 0}</td>
                          <td className="py-3 text-right tabular-nums">{s?.replied ?? 0}</td>
                          <td className={`py-3 text-right tabular-nums ${s?.failed ? "text-red-700" : ""}`}>{s?.failed ?? 0}</td>
                          <td className="py-3 pl-3 text-right">{live && <CancelBroadcastButton onCancel={cancel} />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
