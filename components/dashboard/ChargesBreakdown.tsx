import { calculateTotals, formatMoney, round2 } from "@/lib/dashboard/format";
import ComplimentaryServices from "./ComplimentaryServices";

export type PreviewLineItem = {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  billing_type: "monthly" | "one_time";
  item_type: "service" | "tool";
  project_id: string | null;
  /** Shown with its value and a "Complimentary" label, never charged. */
  is_complimentary?: boolean;
};

export type PreviewProject = {
  id: string;
  name: string;
  scope_of_work: string | null;
};

export type ChargesBreakdownProposal = {
  currency: string;
  discount_enabled: boolean;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  discount_amount: number;
  tax_enabled: boolean;
  tax_name: string;
  tax_rate: number;
  tools_tax_enabled: boolean;
  tools_tax_rate: number;
  tools_tax_amount: number;
  subtotal: number;
  tax_amount: number;
  total: number;
};

/**
 * Renders the Service Charges, Complimentary and Tools & Subscriptions
 * blocks for one bucket of items — either the whole document (no projects
 * defined) or a single project's slice of it. Returns null if the bucket
 * is empty so an unused project section doesn't leave a stray heading.
 *
 * Complimentary lines sit right under the services they come with, so
 * each project shows what's included with it.
 *
 * The international-transaction-tax narration lives here, next to the
 * Tools subtotal it actually explains, rather than as a disconnected
 * footnote down by the grand total — same reasoning for why the Tools
 * subtotal itself is shown tax-inclusive.
 */
function renderCharges(
  bucketItems: PreviewLineItem[],
  complimentaryItems: PreviewLineItem[],
  currency: string,
  keyPrefix: string,
  toolsTax: { enabled: boolean; rate: number }
) {
  const serviceItems = bucketItems.filter((i) => i.item_type !== "tool");
  const toolItems = bucketItems.filter((i) => i.item_type === "tool");
  const toolsSubtotal = toolItems.reduce((sum, item) => sum + Number(item.amount), 0);
  // This bucket's own share of the tools tax (tools can sit in several projects).
  const toolsTaxAmount = toolsTax.enabled ? round2((toolsSubtotal * toolsTax.rate) / 100) : 0;
  const toolsTotal = toolsSubtotal + toolsTaxAmount;

  const groups = [
    { key: "monthly", label: "Monthly Retainer", suffix: "/mo", items: serviceItems.filter((i) => i.billing_type === "monthly") },
    { key: "one_time", label: "One-Time / Fixed Cost", suffix: "", items: serviceItems.filter((i) => i.billing_type !== "monthly") },
  ].filter((group) => group.items.length > 0);

  if (groups.length === 0 && toolItems.length === 0 && complimentaryItems.length === 0) return null;

  return (
    <>
      {groups.length > 0 && (
        <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-3">
          Service Charges
        </p>
      )}
      {groups.map((group) => (
        <div key={`${keyPrefix}-${group.key}`} className="mb-6 last:mb-0 avoid-break">
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
                    {formatMoney(Number(item.rate), currency)}
                  </td>
                  <td className="py-4 pl-3 text-body text-right font-medium whitespace-nowrap">
                    {formatMoney(Number(item.amount), currency)}
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
                    currency
                  )}
                  {group.suffix}
                </span>
              </p>
            </div>
          )}
        </div>
      ))}

      <ComplimentaryServices
        items={complimentaryItems}
        currency={currency}
        className={groups.length > 0 ? "mt-6" : ""}
      />

      {toolItems.length > 0 && (
        <div className={`avoid-break${groups.length > 0 || complimentaryItems.length > 0 ? " mt-8" : ""}`}>
          <p className="flex items-center gap-2.5 mb-3">
            <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
              Tools &amp; Subscriptions
            </span>
            <span className="rounded-full border border-ink/15 px-2 py-0.5 text-tag text-ink-muted">Optional</span>
          </p>
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
              {toolItems.map((item) => (
                <tr key={item.id} className="border-b border-ink/5">
                  <td className="py-4 pr-4 text-body whitespace-pre-line">{item.description}</td>
                  <td className="py-4 px-3 text-body text-right whitespace-nowrap">{Number(item.quantity)}</td>
                  <td className="py-4 px-3 text-body text-right whitespace-nowrap">
                    {formatMoney(Number(item.rate), currency)}
                  </td>
                  <td className="py-4 pl-3 text-body text-right font-medium whitespace-nowrap">
                    {formatMoney(Number(item.amount), currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end pt-2">
            <p className="text-small text-ink-muted">
              Tools subtotal{toolsTax.enabled ? ` (incl. est. ${toolsTax.rate}% intl. tax)` : ""}:{" "}
              <span className="font-medium text-ink">{formatMoney(toolsTotal, currency)}</span>
            </p>
          </div>
          {toolsTaxAmount > 0 && (
            <p className="text-tag text-ink-subtle text-right mt-1">
              *Includes an estimated international transaction tax — the exact amount may vary by
              bank at the time of payment.
            </p>
          )}
        </div>
      )}
    </>
  );
}

/** Shared by ProposalPreview and the Agreement pages — an Agreement is
 *  generated from a Proposal and should show the same itemized pricing
 *  the client already saw and accepted, not just the legal prose. */
export default function ChargesBreakdown({
  proposal,
  items: allItems,
  projects = [],
}: {
  proposal: ChargesBreakdownProposal;
  items: PreviewLineItem[];
  projects?: PreviewProject[];
}) {
  const complimentary = allItems.filter((i) => i.is_complimentary);
  const items = allItems.filter((i) => !i.is_complimentary);
  const knownProjectIds = new Set(projects.map((p) => p.id));
  const isGeneral = (i: PreviewLineItem) => !i.project_id || !knownProjectIds.has(i.project_id);
  const toolsTaxInput = {
    enabled: proposal.tools_tax_enabled,
    rate: Number(proposal.tools_tax_rate),
  };

  // Recomputed from the lines (the same maths the form saves with), so the
  // retainer / one-time split and the optional tools always add up.
  const totals = calculateTotals(
    allItems.map((i) => ({ ...i, quantity: Number(i.quantity), rate: Number(i.rate) })),
    proposal.tax_enabled,
    Number(proposal.tax_rate),
    { enabled: proposal.discount_enabled, type: proposal.discount_type, value: Number(proposal.discount_value) },
    { enabled: proposal.tools_tax_enabled, rate: Number(proposal.tools_tax_rate) }
  );
  const money = (n: number) => formatMoney(n, proposal.currency);
  const hasTools = items.some((i) => i.item_type === "tool");
  const toolsMonthly = items.filter((i) => i.item_type === "tool").every((i) => i.billing_type === "monthly");
  // With only monthly services, every line above the retainer is per month too.
  const perMonth = totals.monthlyTotal > 0 && totals.oneTimeTotal === 0 ? "/mo" : "";

  return (
    <>
      {projects.length === 0 ? (
        renderCharges(items, complimentary, proposal.currency, "flat", toolsTaxInput)
      ) : (
        <div className="space-y-10">
          {projects.map((project) => {
            const rendered = renderCharges(
              items.filter((i) => i.project_id === project.id),
              complimentary.filter((i) => i.project_id === project.id),
              proposal.currency,
              project.id,
              toolsTaxInput
            );
            if (!rendered) return null;
            return (
              <div key={project.id}>
                <p className="text-body-lg font-semibold mb-1">{project.name}</p>
                {project.scope_of_work && (
                  <p className="text-small text-ink-muted mb-4 whitespace-pre-line">
                    {project.scope_of_work}
                  </p>
                )}
                {rendered}
              </div>
            );
          })}
          {(() => {
            const rendered = renderCharges(
              items.filter(isGeneral),
              complimentary.filter(isGeneral),
              proposal.currency,
              "general",
              toolsTaxInput
            );
            if (!rendered) return null;
            return (
              <div>
                <p className="text-body-lg font-semibold mb-4">General</p>
                {rendered}
              </div>
            );
          })()}
        </div>
      )}

      {/* Totals: the retainer (and any one-time fee) is the deal; tools are
          optional, taken and billed only if the client chooses. */}
      <div className="flex justify-end mt-8 avoid-break">
        <div className="w-full max-w-sm space-y-2.5">
          <div className="flex justify-between gap-4 text-body">
            <span className="text-ink-muted">{hasTools ? "Services subtotal" : "Subtotal"}</span>
            <span className="whitespace-nowrap">
              {money(totals.subtotal)}
              {perMonth}
            </span>
          </div>
          {proposal.discount_enabled && totals.discountAmount > 0 && (
            <div className="flex justify-between gap-4 text-body">
              <span className="text-ink-muted">
                Discount
                {proposal.discount_type === "percentage" ? ` (${Number(proposal.discount_value)}%)` : ""}
              </span>
              <span className="whitespace-nowrap">
                −{money(totals.discountAmount)}
                {perMonth}
              </span>
            </div>
          )}
          {proposal.tax_enabled && (
            <div className="flex justify-between gap-4 text-body">
              <span className="text-ink-muted">
                {proposal.tax_name} ({Number(proposal.tax_rate)}%)
              </span>
              <span className="whitespace-nowrap">
                {money(totals.taxAmount)}
                {perMonth}
              </span>
            </div>
          )}
          <div className="pt-3 border-t-2 border-ink space-y-2.5">
            {totals.monthlyTotal > 0 && (
              <div className="flex justify-between items-baseline gap-4">
                <span className="font-semibold">Monthly Retainer</span>
                <span className="font-serif italic text-h3 leading-none whitespace-nowrap">
                  {money(totals.monthlyTotal)}
                  <span className="text-body not-italic font-sans text-ink-muted">/mo</span>
                </span>
              </div>
            )}
            {(totals.oneTimeTotal > 0 || totals.monthlyTotal === 0) && (
              <div className="flex justify-between items-baseline gap-4">
                <span className="font-semibold">{totals.monthlyTotal > 0 ? "One-time" : "Total"}</span>
                <span
                  className={
                    totals.monthlyTotal > 0
                      ? "text-body-lg font-semibold whitespace-nowrap"
                      : "font-serif italic text-h3 leading-none whitespace-nowrap"
                  }
                >
                  {money(totals.oneTimeTotal)}
                </span>
              </div>
            )}
          </div>
          {hasTools && (
            <div className="mt-4 pt-3 border-t border-dashed border-ink/20">
              <div className="flex justify-between items-baseline gap-4 text-body">
                <span className="text-ink-muted">
                  <span className="font-medium text-ink">Optional:</span> Tools &amp; Subscriptions
                </span>
                <span className="whitespace-nowrap">
                  {money(totals.toolsTotal)}
                  {toolsMonthly ? "/mo" : ""}
                </span>
              </div>
              <p className="text-tag tracking-normal text-ink-subtle mt-1.5">
                Taken and billed only if and when you choose — not part of the retainer.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
