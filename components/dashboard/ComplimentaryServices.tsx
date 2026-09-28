import { Gift } from "lucide-react";
import { formatMoney } from "@/lib/dashboard/format";

export type ComplimentaryLine = {
  id: string;
  description: string;
  amount: number;
  billing_type?: "monthly" | "one_time";
};

export type ComplimentaryGroup = {
  key: string;
  /** Project name; null for a document with no projects. */
  title: string | null;
  items: ComplimentaryLine[];
};

/** "Service — what's included" → the service name and its detail. */
function splitDescription(description: string) {
  const at = description.indexOf(" — ");
  if (at <= 0) return { name: description, detail: null };
  return { name: description.slice(0, at), detail: description.slice(at + 3) };
}

/**
 * The Complimentary Services block after a document's totals: grouped by
 * project (each name once), with each line's value struck through. Shared
 * by proposals, agreements, quotations and invoices.
 */
export default function ComplimentaryServices({
  groups,
  currency,
  note,
}: {
  groups: ComplimentaryGroup[];
  currency: string;
  note: string;
}) {
  const visible = groups.filter((g) => g.items.length > 0);
  if (visible.length === 0) return null;

  const all = visible.flatMap((g) => g.items);
  const monthly = all.filter((i) => i.billing_type === "monthly").reduce((sum, i) => sum + Number(i.amount), 0);
  const oneTime = all.filter((i) => i.billing_type !== "monthly").reduce((sum, i) => sum + Number(i.amount), 0);

  return (
    <section className="mt-12 rounded-2xl border border-ink/10 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 px-5 md:px-6 py-5 bg-citrus/[0.07] border-b border-ink/10 break-after-avoid [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
        <div className="flex gap-3 min-w-0 max-w-md">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-citrus/30">
            <Gift className="size-4 text-ink" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-mono uppercase text-tag tracking-widest text-ink">Complimentary Services</p>
            <p className="text-small text-ink-muted mt-1.5">{note}</p>
          </div>
        </div>
        <div className="text-right ml-auto">
          <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">Value included</p>
          <p className="text-body-lg font-semibold mt-1.5">
            {monthly > 0 && <span className="whitespace-nowrap">{formatMoney(monthly, currency)}/mo</span>}
            {monthly > 0 && oneTime > 0 && <span className="text-ink-subtle font-normal"> + </span>}
            {oneTime > 0 && <span className="whitespace-nowrap">{formatMoney(oneTime, currency)}</span>}
          </p>
          {monthly > 0 && oneTime > 0 && <p className="text-tag text-ink-subtle mt-1">monthly + one-time</p>}
        </div>
      </div>

      <table className="w-full text-left">
        {visible.map((group, g) => (
          <tbody key={group.key} className="avoid-break">
            {group.title && (
              <tr className={g > 0 ? "border-t border-ink/10" : undefined}>
                <th colSpan={2} className="px-5 md:px-6 pt-5 pb-1 text-left font-normal">
                  <span className="text-small font-semibold text-ink">{group.title}</span>
                  <span className="text-small text-ink-subtle">
                    {" "}
                    · {group.items.length} service{group.items.length === 1 ? "" : "s"}
                  </span>
                </th>
              </tr>
            )}
            {group.items.map((item, i) => {
              const { name, detail } = splitDescription(item.description);
              return (
                <tr key={item.id} className={i > 0 || !group.title ? "border-t border-ink/5" : undefined}>
                  <td className="pl-5 md:pl-6 pr-4 py-3.5 align-top">
                    <p className="text-body font-medium leading-snug">{name}</p>
                    {detail && <p className="text-small text-ink-muted mt-1 whitespace-pre-line">{detail}</p>}
                  </td>
                  <td className="pr-5 md:pr-6 pl-3 py-3.5 align-top text-right whitespace-nowrap">
                    <p className="text-small text-ink-subtle line-through decoration-ink/40">
                      {formatMoney(Number(item.amount), currency)}
                      {item.billing_type === "monthly" ? "/mo" : ""}
                    </p>
                    <span className="inline-block mt-1.5 rounded-full border border-forest/30 bg-forest/10 px-2.5 py-1 font-mono uppercase text-[0.625rem] leading-none tracking-wider text-ink [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
                      Complimentary
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
      <div className="h-2" aria-hidden />
    </section>
  );
}
