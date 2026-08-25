import { Plus } from "lucide-react";
import Link from "next/link";
import { db } from "@/lib/dashboard/db";
import { formatMoney, formatDate } from "@/lib/dashboard/format";
import { PageHeader, EmptyState, LinkButton, Card, StatusBadge } from "@/components/dashboard/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proposals" };

type ProposalRow = {
  id: string;
  number: string;
  status: string;
  created_at: string;
  currency: string;
  total: number;
  prospect_name: string;
  prospect_business: string | null;
};

export default async function ProposalsPage() {
  const { data } = await db
    .from("proposals")
    .select("id, number, status, created_at, currency, total, prospect_name, prospect_business")
    .order("created_at", { ascending: false });

  const proposals = (data ?? []) as ProposalRow[];

  return (
    <>
      <PageHeader
        title="Proposals"
        description="Send a prospect your services and scope of work — they view, accept, and onboarding kicks off."
        action={
          <LinkButton href="/dashboard/proposals/new">
            <Plus className="size-4" aria-hidden />
            New proposal
          </LinkButton>
        }
      />

      {proposals.length === 0 ? (
        <EmptyState
          title="No proposals yet"
          description="Put together a proposal — situation, solution, scope, investment — and send it."
          action={<LinkButton href="/dashboard/proposals/new">New proposal</LinkButton>}
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
                    Prospect
                  </th>
                  <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3 hidden md:table-cell">
                    Date
                  </th>
                  <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3 text-right">
                    Total
                  </th>
                  <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => (
                  <tr key={p.id} className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.02]">
                    <td className="px-5 py-4">
                      <Link
                        href={`/dashboard/proposals/${p.id}`}
                        className="font-medium hover:underline decoration-citrus decoration-2 underline-offset-4 whitespace-nowrap"
                      >
                        {p.number}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-small">
                      {p.prospect_business || p.prospect_name}
                    </td>
                    <td className="px-5 py-4 text-small text-ink-muted hidden md:table-cell whitespace-nowrap">
                      {formatDate(p.created_at)}
                    </td>
                    <td className="px-5 py-4 text-small font-medium text-right whitespace-nowrap">
                      {formatMoney(Number(p.total), p.currency)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={p.status} />
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
