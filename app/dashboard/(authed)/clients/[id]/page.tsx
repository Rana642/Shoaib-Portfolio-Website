import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { deleteClient } from "@/lib/dashboard/actions/clients";
import { formatMoney, formatDate } from "@/lib/dashboard/format";
import { PageHeader, Card, StatusBadge } from "@/components/dashboard/ui";
import ClientForm from "@/components/dashboard/ClientForm";
import ClientProjectsManager from "@/components/dashboard/ClientProjectsManager";
import DeleteButton from "@/components/dashboard/DeleteButton";
import type { Client, ClientProject, Invoice, Quotation } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";

export default async function EditClientPage({ params }: PageProps<"/dashboard/clients/[id]">) {
  const { id } = await params;

  const [{ data: client }, { data: quotations }, { data: invoices }, { data: projectsData }] =
    await Promise.all([
      db.from("clients").select("*").eq("id", id).single(),
      db.from("quotations").select("*").eq("client_id", id).order("created_at", { ascending: false }),
      db.from("invoices").select("*").eq("client_id", id).order("created_at", { ascending: false }),
      db.from("client_projects").select("*").eq("client_id", id).order("sort_order"),
    ]);

  if (!client) notFound();

  const typedClient = client as Client;
  const quotes = (quotations ?? []) as Quotation[];
  const bills = (invoices ?? []) as Invoice[];
  const projects = (projectsData ?? []) as ClientProject[];

  async function handleDelete() {
    "use server";
    return deleteClient(id);
  }

  return (
    <>
      <Link
        href="/dashboard/clients"
        className="group inline-flex items-center gap-2 text-small text-ink-subtle hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
        All clients
      </Link>

      <PageHeader title={typedClient.name} />

      <ClientForm client={typedClient} />

      <ClientProjectsManager clientId={id} projects={projects} />

      {(quotes.length > 0 || bills.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-10 max-w-4xl">
          {quotes.length > 0 && (
            <Card className="p-6">
              <h2 className="text-body-lg font-semibold mb-4">Quotations</h2>
              <ul className="space-y-2">
                {quotes.map((q) => (
                  <li key={q.id}>
                    <Link
                      href={`/dashboard/quotations/${q.id}`}
                      className="flex items-center justify-between gap-4 py-2 group"
                    >
                      <span className="text-small font-medium group-hover:underline">
                        {q.number}
                      </span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span className="text-small">
                          {formatMoney(Number(q.total), q.currency)}
                        </span>
                        <StatusBadge status={q.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {bills.length > 0 && (
            <Card className="p-6">
              <h2 className="text-body-lg font-semibold mb-4">Invoices</h2>
              <ul className="space-y-2">
                {bills.map((inv) => (
                  <li key={inv.id}>
                    <Link
                      href={`/dashboard/invoices/${inv.id}`}
                      className="flex items-center justify-between gap-4 py-2 group"
                    >
                      <span className="text-small font-medium group-hover:underline">
                        {inv.number}
                      </span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span className="text-small">
                          {formatMoney(Number(inv.total), inv.currency)}
                        </span>
                        <StatusBadge status={inv.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <div className="mt-10 pt-8 border-t border-ink/10 max-w-2xl">
        <p className="text-small text-ink-muted mb-3">
          Added {formatDate(typedClient.created_at)}. Clients with documents can&apos;t be deleted —
          mark them inactive instead.
        </p>
        <DeleteButton action={handleDelete} label="Delete client" />
      </div>
    </>
  );
}
