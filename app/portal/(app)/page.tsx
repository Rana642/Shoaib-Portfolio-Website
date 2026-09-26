import { CalendarDays, ChartLine, Clock, Lock, Send, ShieldCheck } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { requirePortalUser } from "@/lib/portal/auth";
import { portalAccountSections, type AccountStatus } from "@/lib/portal/status";
import { formatDate } from "@/lib/dashboard/format";
import { Card, LinkButton } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home" };

const STATUS: Record<AccountStatus, { label: string; className: string; icon: typeof Clock }> = {
  requested: { label: "Requested", className: "bg-citrus/20 border-citrus/60 text-ink", icon: Send },
  received: { label: "Received — being secured", className: "bg-cobalt/10 border-cobalt/30 text-ink", icon: Clock },
  secured: { label: "Secured", className: "bg-forest/10 border-forest/40 text-ink", icon: ShieldCheck },
};

export default async function PortalHomePage() {
  const { clientId } = await requirePortalUser();
  const [{ data: client }, sections] = await Promise.all([
    db.from("clients").select("name").eq("id", clientId).maybeSingle(),
    portalAccountSections(clientId),
  ]);

  return (
    <>
      <h1 className="font-serif italic text-h2">{client?.name}</h1>
      <p className="text-body text-ink-muted mt-2 max-w-2xl">
        This is your private space with me. Send me your account logins here — they&apos;re encrypted on your device before
        they leave it, and only I can open them.
      </p>

      <div className="mt-10 space-y-6">
        {sections.map((section) => (
          <Card key={section.projectId ?? "general"} variant="solid" className="p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-body-lg font-semibold">{section.name}</h2>
              <LinkButton href={`/portal/send?project=${section.projectId ?? "general"}`}>
                <Lock className="size-4" aria-hidden />
                Send accounts
              </LinkButton>
            </div>

            {section.rows.length === 0 ? (
              <p className="text-small text-ink-muted mt-3">Nothing sent yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-ink/5 border-t border-ink/5">
                {section.rows.map((row, i) => {
                  const status = STATUS[row.status];
                  return (
                    <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                      <span className="font-medium">{row.label}</span>
                      {row.note && <span className="text-small text-ink-muted">— {row.note}</span>}
                      <span className="ml-auto flex items-center gap-3">
                        <span className="text-xs text-ink-subtle">{formatDate(row.date)}</span>
                        <span className={cn("inline-flex items-center gap-1.5 text-xs rounded-full border px-2.5 py-1", status.className)}>
                          <status.icon className="size-3.5" aria-hidden />
                          {status.label}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-10">
        {[
          { icon: CalendarDays, title: "Content planner", body: "See and approve your upcoming posts." },
          { icon: ChartLine, title: "Reports", body: "How your ads and pages are performing." },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border border-dashed border-ink/15 px-5 py-4">
            <p className="flex items-center gap-2 font-medium">
              <f.icon className="size-4 text-ink-muted" aria-hidden />
              {f.title}
              <span className="ml-auto font-mono uppercase text-tag tracking-widest text-ink-subtle">Coming soon</span>
            </p>
            <p className="text-small text-ink-muted mt-1">{f.body}</p>
          </div>
        ))}
      </div>
    </>
  );
}
