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
  const wrapperPad = wrapped ? "p-8" : "";

  const summary = proposal && (
    <div>
      <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-3">
        Investment Summary
      </p>
      <ChargesBreakdown proposal={proposal} items={items} projects={projects} />
    </div>
  );

  if (!clauses || clauses.length === 0) {
    return (
      <>
        {summary && <Wrapper className={`${wrapperPad} mb-6 avoid-break`}>{summary}</Wrapper>}
        <Wrapper className={wrapperPad}>
          <p className="text-body whitespace-pre-line">{content}</p>
        </Wrapper>
      </>
    );
  }

  const anchorIndex = clauses.findIndex((c) => c.showInvestmentSummary);

  return (
    <Wrapper className={`${wrapperPad} space-y-8`}>
      <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
        Consultation &amp; Services Agreement
      </p>
      {clauses.map((clause, index) => (
        <Fragment key={index}>
          <div className="avoid-break">
            {clause.title && <p className="text-small font-semibold text-ink mb-2">{clause.title}</p>}
            <p className="text-body whitespace-pre-line">{clause.body}</p>
          </div>
          {index === anchorIndex && summary && (
            <div className="pt-8 border-t border-ink/10 avoid-break">{summary}</div>
          )}
        </Fragment>
      ))}
      {anchorIndex === -1 && summary && (
        <div className="pt-8 border-t border-ink/10 avoid-break">{summary}</div>
      )}
    </Wrapper>
  );
}
