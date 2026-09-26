import Link from "next/link";
import { ArrowRight, CalendarDays, ChartLine, Clock, FileText, Lock, Send, ShieldCheck } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { can, requirePortalUser } from "@/lib/portal/auth";
import { portalAccountSections, type AccountStatus } from "@/lib/portal/status";
import { formatDate } from "@/lib/dashboard/format";
import { Card, LinkButton } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";
import type { PortalFeature } from "@/lib/portal/features";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home" };

const STATUS: Record<AccountStatus, { label: string; className: string; icon: typeof Clock }> = {
  requested: { label: "Requested", className: "bg-citrus/20 border-citrus/60 text-ink", icon: Send },
  received: { label: "Received — being secured", className: "bg-cobalt/10 border-cobalt/30 text-ink", icon: Clock },
  secured: { label: "Secured", className: "bg-forest/10 border-forest/40 text-ink", icon: ShieldCheck },
};

// Switched-on features whose screens are still being built.
const COMING: { feature: PortalFeature; icon: typeof Clock; title: string; body: string }[] = [
  { feature: "reports", icon: ChartLine, title: "Reports", body: "How your ads and pages are performing." },
];

export default async function PortalHomePage() {
  const ctx = await requirePortalUser();
  const showAccounts = can(ctx, "credentials");
  const [{ data: client }, sections, { count: openIntakes }] = await Promise.all([
    db.from("clients").select("name").eq("id", ctx.clientId).maybeSingle(),
    showAccounts ? portalAccountSections(ctx.clientId, ctx.projectIds) : Promise.resolve([]),
    can(ctx, "intakes")
      ? db
          .from("client_intakes")
          .select("id", { count: "exact", head: true })
          .eq("client_id", ctx.clientId)
          .eq("status", "pending")
          .eq("locked", false)
      : Promise.resolve({ count: 0 }),
  ]);
  const coming = COMING.filter((c) => can(ctx, c.feature));

  return (
    <>
      <h1 className="font-serif italic text-h2">{client?.name}</h1>
      <p className="text-body text-ink-muted mt-2 max-w-2xl">
        This is your private space with me{showAccounts ? " — send me your account logins here; they're encrypted on your device before they leave it, and only I can open them" : ""}.
      </p>

      {(can(ctx, "planner") || can(ctx, "uploads")) && (
        <Link
          href="/portal/planner"
          className="mt-8 flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-5 py-4 hover:border-ink/25 transition-colors"
        >
          <CalendarDays className="size-5 text-ink-muted shrink-0" aria-hidden />
          <span className="flex-1">
            <span className="block font-medium">Content planner</span>
            <span className="block text-small text-ink-muted">
              {can(ctx, "uploads") ? "Upload your graphics and see what's scheduled" : "See what's scheduled and posted"}
            </span>
          </span>
          <ArrowRight className="size-4 text-ink-subtle" aria-hidden />
        </Link>
      )}

      {can(ctx, "intakes") && (
        <Link
          href="/portal/intakes"
          className="mt-8 flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-5 py-4 hover:border-ink/25 transition-colors"
        >
          <FileText className="size-5 text-ink-muted shrink-0" aria-hidden />
          <span className="flex-1">
            <span className="block font-medium">Intake forms</span>
            <span className="block text-small text-ink-muted">
              {openIntakes ? `${openIntakes} waiting for your answers` : "Set-up forms for your projects"}
            </span>
          </span>
          <ArrowRight className="size-4 text-ink-subtle" aria-hidden />
        </Link>
      )}

      {showAccounts && (
        <div className="mt-8 space-y-6">
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
      )}

      {coming.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-10">
          {coming.map((f) => (
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
      )}

      {!showAccounts && !can(ctx, "intakes") && !can(ctx, "planner") && !can(ctx, "uploads") && coming.length === 0 && (
        <Card variant="solid" className="p-6 mt-8">
          <p className="text-small text-ink-muted">Nothing is switched on for you here yet — I&apos;ll let you know when there is.</p>
        </Card>
      )}
    </>
  );
}
