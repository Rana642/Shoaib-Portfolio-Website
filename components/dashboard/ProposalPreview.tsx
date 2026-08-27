import { formatMoney, formatDate } from "@/lib/dashboard/format";
import type { Settings } from "@/lib/dashboard/types";

type PreviewLineItem = {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  billing_type: "monthly" | "one_time";
};

type PreviewProposal = {
  number: string;
  created_at: string;
  prospect_name: string;
  prospect_email: string;
  prospect_business: string | null;
  situation: string | null;
  proposed_solution: string | null;
  scope_of_work: string | null;
  currency: string;
  discount_enabled: boolean;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  discount_amount: number;
  tax_enabled: boolean;
  tax_name: string;
  tax_rate: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  terms: string | null;
};

/**
 * The client-facing proposal. Same "render on screen, print via browser
 * @media print" approach as DocumentPreview.tsx — reused as-is by both the
 * dashboard's own detail page and the public /proposal/[token] page, with
 * an optional `footer` slot for the public page's accept/decline form.
 */
export default function ProposalPreview({
  proposal,
  items,
  settings,
  footer,
}: {
  proposal: PreviewProposal;
  items: PreviewLineItem[];
  settings: Settings;
  footer?: React.ReactNode;
}) {
  const groups = [
    { key: "monthly", label: "Monthly Retainer", suffix: "/mo", items: items.filter((i) => i.billing_type === "monthly") },
    { key: "one_time", label: "One-Time / Fixed Cost", suffix: "", items: items.filter((i) => i.billing_type !== "monthly") },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="bg-white border border-ink/10 rounded-xl p-8 md:p-12 print:border-0 print:rounded-none print:p-0">
      {/* Header */}
      <div className="flex flex-wrap justify-between gap-8 pb-8 border-b-2 border-citrus">
        <div>
          <p className="font-serif italic text-h3 leading-none">
            {settings.business_name}
            <span className="text-citrus not-italic font-sans">.</span>
          </p>
          <div className="text-small text-ink-muted mt-3 space-y-0.5">
            {settings.business_address && <p>{settings.business_address}</p>}
            {settings.business_email && <p>{settings.business_email}</p>}
            {settings.business_phone && <p>{settings.business_phone}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">Proposal</p>
          <p className="font-serif italic text-h3 mt-1 leading-none">{proposal.number}</p>
          <div className="text-small text-ink-muted mt-3 space-y-0.5">
            <p>Prepared {formatDate(proposal.created_at)}</p>
          </div>
        </div>
      </div>

      {/* Prepared for */}
      <div className="py-8">
        <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">Prepared for</p>
        <p className="text-body-lg font-semibold mt-2">
          {proposal.prospect_business || proposal.prospect_name}
        </p>
        <div className="text-small text-ink-muted mt-1 space-y-0.5">
          {proposal.prospect_business && <p>{proposal.prospect_name}</p>}
          <p>{proposal.prospect_email}</p>
        </div>
      </div>

      {/* Narrative sections */}
      {(proposal.situation || proposal.proposed_solution || proposal.scope_of_work) && (
        <div className="space-y-8 pb-8">
          {proposal.situation && (
            <div>
              <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-2">
                Where you are
              </p>
              <p className="text-body whitespace-pre-line">{proposal.situation}</p>
            </div>
          )}
          {proposal.proposed_solution && (
            <div>
              <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-2">
                Proposed solution
              </p>
              <p className="text-body whitespace-pre-line">{proposal.proposed_solution}</p>
            </div>
          )}
          {proposal.scope_of_work && (
            <div>
              <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-2">
                Scope of work
              </p>
              <p className="text-body whitespace-pre-line">{proposal.scope_of_work}</p>
            </div>
          )}
        </div>
      )}

      {/* Service charges */}
      <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-3">
        Service Charges
      </p>
      {groups.map((group) => (
        <div key={group.key} className="mb-6 last:mb-0">
          {groups.length > 1 && (
            <p className="text-small font-semibold text-ink mb-2">{group.label}</p>
          )}
          <table className="w-full text-left">
            <thead>
              <tr className="border-y border-ink/10">
                <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle py-3 pr-4">
                  Description
                </th>
                <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle py-3 px-3 text-right whitespace-nowrap">
                  Qty
                </th>
                <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle py-3 px-3 text-right whitespace-nowrap">
                  Rate
                </th>
                <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle py-3 pl-3 text-right whitespace-nowrap">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {group.items.map((item) => (
                <tr key={item.id} className="border-b border-ink/5">
                  <td className="py-4 pr-4 text-body whitespace-pre-line">{item.description}</td>
                  <td className="py-4 px-3 text-body text-right whitespace-nowrap">{Number(item.quantity)}</td>
                  <td className="py-4 px-3 text-body text-right whitespace-nowrap">
                    {formatMoney(Number(item.rate), proposal.currency)}
                  </td>
                  <td className="py-4 pl-3 text-body text-right font-medium whitespace-nowrap">
                    {formatMoney(Number(item.amount), proposal.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {groups.length > 1 && (
            <div className="flex justify-end pt-2">
              <p className="text-small text-ink-muted">
                {group.label} subtotal:{" "}
                <span className="font-medium text-ink">
                  {formatMoney(
                    group.items.reduce((sum, item) => sum + Number(item.amount), 0),
                    proposal.currency
                  )}
                  {group.suffix}
                </span>
              </p>
            </div>
          )}
        </div>
      ))}

      {/* Totals */}
      <div className="flex justify-end mt-6">
        <div className="w-full max-w-xs space-y-2.5">
          <div className="flex justify-between text-body">
            <span className="text-ink-muted">Subtotal</span>
            <span>{formatMoney(Number(proposal.subtotal), proposal.currency)}</span>
          </div>
          {proposal.discount_enabled && Number(proposal.discount_amount) > 0 && (
            <div className="flex justify-between text-body">
              <span className="text-ink-muted">
                Discount
                {proposal.discount_type === "percentage" ? ` (${Number(proposal.discount_value)}%)` : ""}
              </span>
              <span>−{formatMoney(Number(proposal.discount_amount), proposal.currency)}</span>
            </div>
          )}
          {proposal.tax_enabled && (
            <div className="flex justify-between text-body">
              <span className="text-ink-muted">
                {proposal.tax_name} ({Number(proposal.tax_rate)}%)
              </span>
              <span>{formatMoney(Number(proposal.tax_amount), proposal.currency)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2.5 border-t-2 border-ink">
            <span className="font-semibold">Total</span>
            <span className="font-serif italic text-h3 leading-none">
              {formatMoney(Number(proposal.total), proposal.currency)}
            </span>
          </div>
        </div>
      </div>

      {/* Terms */}
      {proposal.terms && (
        <div className="mt-10 pt-8 border-t border-ink/10">
          <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-2">
            Terms
          </p>
          <p className="text-small text-ink-muted whitespace-pre-line">{proposal.terms}</p>
        </div>
      )}

      {footer}
    </div>
  );
}
