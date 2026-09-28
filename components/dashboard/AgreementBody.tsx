import { Fragment, type ElementType } from "react";
import { Card } from "@/components/dashboard/ui";
import ChargesBreakdown, {
  type ChargesBreakdownProposal,
  type PreviewLineItem,
  type PreviewProject,
} from "@/components/dashboard/ChargesBreakdown";
import type { AgreementClause } from "@/lib/dashboard/types";

/**
 * Renders an Agreement's legal text. New agreements store structured
 * `clauses`, so the Investment Summary renders right after whichever
 * clause it's anchored to (Fees & Payment, by default) instead of as a
 * disconnected block above the whole document — keeps the pricing next
 * to the fee it explains. Agreements created before `clauses` existed
 * only have the old frozen `content` blob — those keep rendering exactly
 * as they always have (documents are frozen snapshots).
 *
 * Hidden clauses are skipped, and numbered titles ("3. Term…") are
 * renumbered over the visible ones so hiding one leaves no gap. If the
 * clause carrying the Investment Summary is hidden, the summary still
 * shows in its place.
 */
export default function AgreementBody({
  content,
  clauses,
  proposal,
  items,
  projects,
  wrapped = true,
}: {
  content: string | null;
  clauses: AgreementClause[] | null;
  proposal: ChargesBreakdownProposal | null;
  items: PreviewLineItem[];
  projects: PreviewProject[];
  /** The dashboard page has no outer card of its own, so this wraps
   *  itself in one (default). The public page already renders one big
   *  white document card around everything — pass `false` there so this
   *  doesn't nest a second card inside it. */
  wrapped?: boolean;
}) {
  const Wrapper: ElementType = wrapped ? Card : "div";
  const wrapperPad = wrapped ? "p-8 print:p-0 print:border-0 print:rounded-none print:shadow-none" : "";

  const summary = proposal && (
    <div className="print-compact">
      <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-3 keep-with-next">
        Investment Summary
      </p>
      <ChargesBreakdown proposal={proposal} items={items} projects={projects} />
    </div>
  );

  if (!clauses || clauses.length === 0) {
    return (
      <>
        {summary && <Wrapper className={`${wrapperPad} mb-6`}>{summary}</Wrapper>}
        <Wrapper className={wrapperPad}>
          <p className="text-body whitespace-pre-line">{content}</p>
        </Wrapper>
      </>
    );
  }

  const anchorIndex = clauses.findIndex((c) => c.showInvestmentSummary);
  const numbered = clauses.map((c) => !c.hidden && /^\d+\.\s+/.test(c.title));
  const titles = clauses.map((clause, index) => {
    if (!numbered[index]) return clause.title;
    const position = numbered.slice(0, index + 1).filter(Boolean).length;
    return clause.title.replace(/^\d+\.\s+/, `${position}. `);
  });

  return (
    <Wrapper className={`${wrapperPad} space-y-8`}>
      <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
        Consultation &amp; Services Agreement
      </p>
      {clauses.map((clause, index) => (
        <Fragment key={index}>
          {!clause.hidden && (
            <div className="avoid-break">
              {titles[index] && <p className="text-small font-semibold text-ink mb-2">{titles[index]}</p>}
              <p className="text-body whitespace-pre-line">{clause.body}</p>
            </div>
          )}
          {index === anchorIndex && summary && <div className="pt-8 border-t border-ink/10">{summary}</div>}
        </Fragment>
      ))}
      {anchorIndex === -1 && summary && <div className="pt-8 border-t border-ink/10">{summary}</div>}
    </Wrapper>
  );
}
