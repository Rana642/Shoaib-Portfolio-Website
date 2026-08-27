import { formatDate } from "@/lib/dashboard/format";
import type { Settings } from "@/lib/dashboard/types";
import ChargesBreakdown, {
  type ChargesBreakdownProposal,
  type PreviewLineItem,
  type PreviewProject,
} from "./ChargesBreakdown";

type PreviewProposal = ChargesBreakdownProposal & {
  number: string;
  created_at: string;
  prospect_name: string;
  prospect_email: string;
  prospect_business: string | null;
  situation: string | null;
  proposed_solution: string | null;
  scope_of_work: string | null;
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
  projects = [],
  settings,
  footer,
}: {
  proposal: PreviewProposal;
  items: PreviewLineItem[];
  projects?: PreviewProject[];
  settings: Settings;
  footer?: React.ReactNode;
}) {
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

      <ChargesBreakdown proposal={proposal} items={items} projects={projects} />

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
