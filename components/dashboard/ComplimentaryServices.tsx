import { Gift } from "lucide-react";
import { formatMoney } from "@/lib/dashboard/format";

export type ComplimentaryLine = {
  id: string;
  description: string;
  amount: number;
  billing_type?: "monthly" | "one_time";
};

/** "Service — what's included" → the service name and its detail. */
function splitDescription(description: string) {
  const at = description.indexOf(" — ");
  if (at <= 0) return { name: description, detail: null };
  return { name: description.slice(0, at), detail: description.slice(at + 3) };
}

/**
 * The complimentary services that come with one project (or a whole
 * quotation/invoice), shown right under its charged services: each line's
 * value struck through, never counted in any total. Shared by proposals,
 * agreements, quotations and invoices.
 */
export default function ComplimentaryServices({
  items,
  currency,
  className = "",
}: {
  items: ComplimentaryLine[];
  currency: string;
  className?: string;
}) {
  if (items.length === 0) return null;

  const monthly = items.filter((i) => i.billing_type === "monthly").reduce((sum, i) => sum + Number(i.amount), 0);
  const oneTime = items.filter((i) => i.billing_type !== "monthly").reduce((sum, i) => sum + Number(i.amount), 0);

  return (
    <div className={`rounded-xl border border-ink/10 overflow-hidden ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 px-4 md:px-5 py-3 bg-citrus/[0.07] border-b border-ink/10 break-after-avoid [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
        <p className="flex items-center gap-2.5">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-citrus/30">
            <Gift className="size-3.5 text-ink" aria-hidden />
          </span>
          <span className="font-mono uppercase text-tag tracking-widest text-ink">Complimentary</span>
          <span className="text-small text-ink-muted">· included at no charge</span>
        </p>
        <p className="text-small">
          <span className="text-ink-muted">Value </span>
          <span className="font-semibold">
            {monthly > 0 && <span className="whitespace-nowrap">{formatMoney(monthly, currency)}/mo</span>}
            {monthly > 0 && oneTime > 0 && <span className="text-ink-subtle font-normal"> + </span>}
            {oneTime > 0 && (
              <span className="whitespace-nowrap">
                {formatMoney(oneTime, currency)}
                {monthly > 0 ? " one-time" : ""}
              </span>
            )}
          </span>
        </p>
      </div>

      <table className="w-full text-left">
        <tbody>
          {items.map((item, i) => {
            const { name, detail } = splitDescription(item.description);
            return (
              <tr key={item.id} className={i > 0 ? "border-t border-ink/5" : undefined}>
                <td className="pl-4 md:pl-5 pr-4 py-3.5 align-top">
                  <p className="text-body font-medium leading-snug">{name}</p>
                  {detail && <p className="text-small text-ink-muted mt-1 whitespace-pre-line">{detail}</p>}
                </td>
                <td className="pr-4 md:pr-5 pl-3 py-3.5 align-top text-right whitespace-nowrap">
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
      </table>
    </div>
  );
}
