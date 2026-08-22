import Link from "next/link";
import { formatMoney, formatDate } from "@/lib/dashboard/format";
import { Card, StatusBadge } from "@/components/dashboard/ui";

type DocumentRow = {
  id: string;
  number: string;
  status: string;
  issue_date: string;
  currency: string;
  total: number;
  clients: { name: string } | null;
};

/** Shared list rendering for quotations and invoices — same columns,
 *  different base path and trailing column. */
export default function DocumentTable({
  documents,
  basePath,
  trailingLabel,
  renderTrailing,
}: {
  documents: DocumentRow[];
  basePath: string;
  trailingLabel?: string;
  renderTrailing?: (doc: DocumentRow) => React.ReactNode;
}) {
  return (
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
              <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3 text-right">
                Total
              </th>
              <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3">
                {trailingLabel ?? "Status"}
              </th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id} className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.02]">
                <td className="px-5 py-4">
                  <Link
                    href={`${basePath}/${doc.id}`}
                    className="font-medium hover:underline decoration-citrus decoration-2 underline-offset-4 whitespace-nowrap"
                  >
                    {doc.number}
                  </Link>
                </td>
                <td className="px-5 py-4 text-small">{doc.clients?.name ?? "—"}</td>
                <td className="px-5 py-4 text-small text-ink-muted hidden md:table-cell whitespace-nowrap">
                  {formatDate(doc.issue_date)}
                </td>
                <td className="px-5 py-4 text-small font-medium text-right whitespace-nowrap">
                  {formatMoney(Number(doc.total), doc.currency)}
                </td>
                <td className="px-5 py-4">
                  {renderTrailing ? renderTrailing(doc) : <StatusBadge status={doc.status} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
