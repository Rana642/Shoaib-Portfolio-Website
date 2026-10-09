import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { Card, PageHeader } from "@/components/dashboard/ui";
import { DeleteTemplateButton, TemplateBuilder, TemplatePreview } from "@/components/whatsapp/Templates";
import { createWhatsAppTemplate, deleteWhatsAppTemplate } from "@/lib/dashboard/actions/whatsapp";
import { listTemplates } from "@/lib/whatsapp-templates";
import type { TemplateInput } from "@/lib/whatsapp-template-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp templates" };

const STATUS_STYLE: Record<string, string> = {
  APPROVED: "bg-forest/15 text-forest border-forest/30",
  PENDING: "bg-citrus/20 text-ink border-citrus/40",
  REJECTED: "bg-red-500/10 text-red-700 border-red-600/30",
};

/** Message templates per WhatsApp number: what's approved, pending or rejected, and a builder for new ones. */
export default async function WhatsAppTemplatesPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
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
  if (selected) {
    try {
      templates = await listTemplates(selected.id);
    } catch (e) {
      loadError = e instanceof Error ? e.message : "Couldn't load templates.";
    }
  }

  async function create(input: TemplateInput) {
    "use server";
    return createWhatsAppTemplate(selected!.id, input);
  }
  async function remove(templateName: string) {
    "use server";
    return deleteWhatsAppTemplate(selected!.id, templateName);
  }

  return (
    <>
      <Link href="/dashboard/whatsapp" className="inline-flex items-center gap-1.5 text-small text-ink-subtle hover:text-ink mb-4">
        <ArrowLeft className="size-4" aria-hidden /> Inbox
      </Link>
      <PageHeader
        title="WhatsApp templates"
        description="Pre-approved messages — the only way to message a customer after the 24-hour reply window closes. Meta reviews each one before it can be sent."
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
                  href={`/dashboard/whatsapp/templates?account=${a.id}`}
                  className={`rounded-lg border px-3 py-1.5 ${a.id === selected.id ? "border-ink bg-ink text-cloud" : "border-ink/15 hover:bg-ink/5"}`}
                >
                  {name(a)}
                </Link>
              ))}
            </nav>
          )}

          <Card className="p-6 mb-6">
            <h2 className="text-body-lg font-medium mb-4">
              Templates <span className="text-ink-subtle font-normal">· {name(selected)}</span>
            </h2>
            {loadError && <p className="text-small text-red-700">{loadError}</p>}
            {!loadError && templates.length === 0 && <p className="text-small text-ink-muted">No templates yet — create the first one below.</p>}
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {templates.map((t) => (
                <li key={t.id} className="rounded-xl border border-ink/10 p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <p className="font-medium text-small truncate">{t.name}</p>
                      <p className="font-mono uppercase text-[10px] tracking-wide text-ink-subtle">
                        {t.category.toLowerCase()} · {t.language}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`rounded-full border px-2 py-0.5 text-tag ${STATUS_STYLE[t.status] ?? "border-ink/15 text-ink-muted"}`}>
                        {t.status.toLowerCase()}
                      </span>
                      <DeleteTemplateButton name={t.name} onDelete={remove} />
                    </div>
                  </div>
                  <TemplatePreview header={t.header} body={t.body} footer={t.footer} buttons={t.buttons} />
                  {t.rejectedReason && <p className="text-tag text-red-700 mt-2">Rejected: {t.rejectedReason.toLowerCase().replace(/_/g, " ")}</p>}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-6">
            <h2 className="text-body-lg font-medium mb-1">New template</h2>
            <p className="text-small text-ink-muted mb-5">
              Utility = an update about something the customer asked for (order, booking, appointment). Marketing = offers and promotions —
              costs more. Pick honestly: Meta re-categorises (or rejects) templates that don&apos;t match.
            </p>
            <TemplateBuilder key={selected.id} onCreate={create} />
          </Card>
        </>
      )}
    </>
  );
}
