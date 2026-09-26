import Link from "next/link";
import { ArrowRight, Check, FileText, Lock } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { requirePortalFeature } from "@/lib/portal/auth";
import { formatDate } from "@/lib/dashboard/format";
import { Card } from "@/components/dashboard/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Intake forms" };

/** The set-up forms Shoaib has sent this client — filled in here by the
 *  Owner or any team member with the "intakes" feature. */
export default async function PortalIntakesPage() {
  const ctx = await requirePortalFeature("intakes");
  const { data } = await db
    .from("client_intakes")
    .select("id, business_name, access_token, status, locked, submitted_at, created_at")
    .eq("client_id", ctx.clientId)
    .order("created_at", { ascending: false });
  const intakes = data ?? [];

  return (
    <>
      <h1 className="font-serif italic text-h2">Intake forms</h1>
      <p className="text-body text-ink-muted mt-2 max-w-2xl">
        Set-up forms for your projects. Fill in what you can — you can come back and edit your answers until I close the form.
      </p>

      {intakes.length === 0 ? (
        <Card variant="solid" className="p-6 mt-8">
          <p className="text-small text-ink-muted">No forms yet — when I need details for a project, it&apos;ll appear here.</p>
        </Card>
      ) : (
        <ul className="mt-8 space-y-3">
          {intakes.map((intake) => {
            const done = intake.status === "submitted";
            return (
              <li key={intake.id}>
                <Link
                  href={`/intake/${intake.access_token}`}
                  className="flex items-center gap-4 rounded-xl border border-ink/10 bg-white px-5 py-4 hover:border-ink/25 transition-colors"
                >
                  <FileText className="size-5 text-ink-muted shrink-0" aria-hidden />
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate">{intake.business_name} — social media setup</span>
                    <span className="block text-small text-ink-muted">
                      {intake.locked
                        ? "Closed"
                        : done
                          ? `Sent ${formatDate(intake.submitted_at)} — you can still edit it`
                          : "Waiting for your answers"}
                    </span>
                  </span>
                  {intake.locked ? (
                    <Lock className="size-4 text-ink-subtle" aria-hidden />
                  ) : done ? (
                    <Check className="size-4 text-forest" aria-hidden />
                  ) : (
                    <ArrowRight className="size-4 text-ink-subtle" aria-hidden />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
