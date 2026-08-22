import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { PageHeader, Card, EmptyState, LinkButton, StatusBadge } from "@/components/dashboard/ui";
import type { Client } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const { data } = await db.from("clients").select("*").order("name");
  const clients = (data ?? []) as Client[];

  return (
    <>
      <PageHeader
        title="Clients"
        description="Everyone you quote and invoice."
        action={
          <LinkButton href="/dashboard/clients/new">
            <Plus className="size-4" aria-hidden />
            Add client
          </LinkButton>
        }
      />

      {clients.length === 0 ? (
        <EmptyState
          title="No clients yet"
          description="Add your first client to start creating quotations and invoices."
          action={<LinkButton href="/dashboard/clients/new">Add client</LinkButton>}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-ink/10">
                  <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3">
                    Name
                  </th>
                  <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3 hidden md:table-cell">
                    Contact
                  </th>
                  <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3 hidden lg:table-cell">
                    Country
                  </th>
                  <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr
                    key={client.id}
                    className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.02]"
                  >
                    <td className="px-5 py-4">
                      <Link
                        href={`/dashboard/clients/${client.id}`}
                        className="font-medium hover:underline decoration-citrus decoration-2 underline-offset-4"
                      >
                        {client.name}
                      </Link>
                      {client.email && (
                        <p className="text-small text-ink-subtle mt-0.5">{client.email}</p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-small text-ink-muted hidden md:table-cell">
                      {client.contact_person ?? "—"}
                    </td>
                    <td className="px-5 py-4 text-small text-ink-muted hidden lg:table-cell">
                      {client.country ?? "—"}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={client.is_active ? "accepted" : "draft"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
