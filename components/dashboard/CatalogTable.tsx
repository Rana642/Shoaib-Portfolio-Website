import Link from "next/link";
import { formatMoney } from "@/lib/dashboard/format";
import { Card, StatusBadge } from "@/components/dashboard/ui";
import type { CatalogItem } from "@/lib/dashboard/types";

export default function CatalogTable({
  items,
  membersByBundle,
  bundleTotals,
}: {
  items: CatalogItem[];
  membersByBundle: Map<string, string[]>;
  /** Bundle id -> combined total of its included services' own rates. */
  bundleTotals?: Map<string, number>;
}) {
  return (
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
              <tr key={item.id} className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.02]">
                <td className="px-5 py-4">
                  <Link
                    href={`/dashboard/catalog/${item.id}`}
                    className="font-medium hover:underline decoration-citrus decoration-2 underline-offset-4"
                  >
                    {item.name}
                  </Link>
                  {item.description && (
                    <p className="text-small text-ink-subtle mt-0.5 max-w-md">{item.description}</p>
                  )}
                  {item.is_bundle && (
                    <p className="text-small text-ink-subtle mt-0.5 max-w-md">
                      {(membersByBundle.get(item.id) ?? []).length > 0
                        ? `Includes: ${membersByBundle.get(item.id)!.join(", ")}`
                        : "No services selected yet"}
                    </p>
                  )}
                </td>
                <td className="px-5 py-4 whitespace-nowrap">
                  {item.is_bundle && (bundleTotals?.get(item.id) ?? 0) > 0 && (
                    <p className="text-small text-ink-subtle line-through">
                      {formatMoney(bundleTotals!.get(item.id)!, item.currency)}
                    </p>
                  )}
                  <span className="font-medium">
                    {formatMoney(Number(item.default_rate), item.currency)}
                  </span>
                  <span className="text-small text-ink-subtle"> / {item.unit}</span>
                  {item.is_bundle && (bundleTotals?.get(item.id) ?? 0) > 0 && (
                    <p className="text-tag font-mono uppercase tracking-widest text-ink-subtle">
                      Bundle Rate
                    </p>
                  )}
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
  );
}
