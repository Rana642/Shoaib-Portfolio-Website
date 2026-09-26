import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { requirePortalUser } from "@/lib/portal/auth";
import { isRequestKey } from "@/lib/vault-platforms";
import { Card } from "@/components/dashboard/ui";
import SendAccountsForm from "@/components/portal/SendAccountsForm";
import { getAccessIdentities } from "@/lib/dashboard/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Send accounts" };

export default async function SendAccountsPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { clientId } = await requirePortalUser();
  const { project } = await searchParams;

  // The project must be this client's — checked here and again on submit.
  let projectId: string | null = null;
  let where: string;
  const { data: client } = await db.from("clients").select("name").eq("id", clientId).maybeSingle();
  if (project && project !== "general") {
    if (!/^[0-9a-f-]{36}$/i.test(project)) notFound();
    const { data } = await db.from("client_projects").select("id, name").eq("id", project).eq("client_id", clientId).maybeSingle();
    if (!data) notFound();
    projectId = data.id;
    where = data.name;
  } else {
    where = client?.name ?? "Your accounts";
  }

  const requestsQuery = db.from("vault_requests").select("platform").eq("client_id", clientId).is("fulfilled_at", null);
  const [{ data: meta }, { data: requests }, identities] = await Promise.all([
    db.from("vault_meta").select("public_key").eq("id", 1).maybeSingle(),
    projectId ? requestsQuery.eq("project_id", projectId) : requestsQuery.is("project_id", null),
    getAccessIdentities(),
  ]);
  const requested = [...new Set((requests ?? []).map((r) => r.platform as string))].filter(isRequestKey);

  return (
    <>
      <Link
        href="/portal"
        className="group inline-flex items-center gap-2 text-small text-ink-subtle hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
        Back
      </Link>
      <h1 className="font-serif italic text-h2">Send accounts — {where}</h1>
      <p className="text-body text-ink-muted mt-2 max-w-2xl">
        Fill in what you have — anything you don&apos;t know can stay empty. Everything is locked on this device before it&apos;s
        sent, and only I can open it; you won&apos;t be able to view it again here.
      </p>

      {meta?.public_key ? (
        <SendAccountsForm projectId={projectId} where={where} publicKey={meta.public_key} requested={requested} identities={identities} />
      ) : (
        <Card variant="solid" className="p-6 mt-8 flex gap-3">
          <Lock className="size-5 shrink-0 text-ink-muted" aria-hidden />
          <p className="text-small text-ink-muted">
            The secure form isn&apos;t switched on yet. I&apos;ll let you know as soon as it&apos;s ready — please don&apos;t send
            passwords over WhatsApp or email in the meantime.
          </p>
        </Card>
      )}
    </>
  );
}
