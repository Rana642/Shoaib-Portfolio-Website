import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { formatMoney } from "@/lib/dashboard/format";
import { PageHeader, Card, EmptyState, LinkButton, StatusBadge } from "@/components/dashboard/ui";
import type { CatalogItem } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const { data } = await db
    .from("catalog_items")
    .select("*")
    .order("sort_order")
    .order("name");
  const items = (data ?? []) as CatalogItem[];

  return (
    <>
      <PageHeader
        title="Services Catalog"
        description="Priced, billable items. Separate from the website's Services pages, which live in Sanity."
        action={
          <LinkButton href="/dashboard/catalog/new">
            <Plus className="size-4" aria-hidden />
            Add item
          </LinkButton>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="Catalog is empty"
          description="Add the services you bill for — with rates — and they become one-click line items on quotations and invoices."
          action={<LinkButton href="/dashboard/catalog/new">Add item</LinkButton>}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-ink/10">
                  <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3">
                    Item
                  </th>
                  <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3">
                    Rate
                  </th>
                  <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3 hidden sm:table-cell">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.02]"
                  >
                    <td className="px-5 py-4">
                      <Link
                        href={`/dashboard/catalog/${item.id}`}
                        className="font-medium hover:underline decoration-citrus decoration-2 underline-offset-4"
                      >
                        {item.name}
                      </Link>
                      {item.description && (
                        <p className="text-small text-ink-subtle mt-0.5 max-w-md">
                          {item.description}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className="font-medium">
                        {formatMoney(Number(item.default_rate), item.currency)}
                      </span>
                      <span className="text-small text-ink-subtle"> / {item.unit}</span>
                    </td>
                    <td className="px-5 py-4 hidden sm:table-cell">
                      <StatusBadge status={item.is_active ? "accepted" : "draft"} />
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
