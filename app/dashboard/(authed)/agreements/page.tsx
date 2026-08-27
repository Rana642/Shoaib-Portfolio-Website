import { Plus } from "lucide-react";
import Link from "next/link";
import { db } from "@/lib/dashboard/db";
import { formatDate } from "@/lib/dashboard/format";
import { PageHeader, Card, EmptyState, StatusBadge, LinkButton } from "@/components/dashboard/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agreements" };

type AgreementRow = {
  id: string;
  number: string;
  status: string;
  created_at: string;
  clients: { name: string } | null;
};

export default async function AgreementsPage() {
  const { data } = await db
    .from("agreements")
    .select("id, number, status, created_at, clients(name)")
    .order("created_at", { ascending: false });

  const agreements = (data ?? []) as unknown as AgreementRow[];

  return (
    <>
      <PageHeader
        title="Agreements"
        description="Generated once a proposal is accepted — online, or manually for clients who confirm offline."
        action={
          <LinkButton href="/dashboard/agreements/new">
            <Plus className="size-4" aria-hidden />
            New agreement
          </LinkButton>
        }
      />

      {agreements.length === 0 ? (
        <EmptyState
          title="No agreements yet"
          description="These show up once a proposal is accepted — online, or create one yourself from an existing proposal."
          action={<LinkButton href="/dashboard/agreements/new">New agreement</LinkButton>}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-ink/10">
                  <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3">
                    Number
                  </th>
                  <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3">
                    Client
                  </th>
                  <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3 hidden md:table-cell">
                    Date
                  </th>
                  <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {agreements.map((a) => (
                  <tr key={a.id} className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.02]">
                    <td className="px-5 py-4">
                      <Link
                        href={`/dashboard/agreements/${a.id}`}
                        className="font-medium hover:underline decoration-citrus decoration-2 underline-offset-4 whitespace-nowrap"
                      >
                        {a.number}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-small">{a.clients?.name ?? "—"}</td>
                    <td className="px-5 py-4 text-small text-ink-muted hidden md:table-cell whitespace-nowrap">
                      {formatDate(a.created_at)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={a.status} />
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
