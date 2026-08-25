import { formatMoney } from "./format";

/**
 * Standard consulting-agreement wording, reviewed and approved by Shoaib.
 * Not legal advice — a reasonable standard-practice template, not a
 * substitute for a lawyer's review. Placeholders are filled here and the
 * result is FROZEN into the agreement row at creation time (see
 * agreements.content) — editing this function later must never change an
 * agreement already sent to a client, only new ones going forward.
 */
export function buildAgreementContent(input: {
  clientName: string;
  clientBusiness: string;
  proposalNumber: string;
  scopeOfWork: string;
  feeAmount: number;
  currency: string;
  paymentTerms: string;
  effectiveDate: string;
}): string {
  const fee = formatMoney(input.feeAmount, input.currency);
  // The template appends its own trailing period after each of these —
  // strip one the source text already ends with so it doesn't double up.
  const scopeOfWork = input.scopeOfWork.trim().replace(/\.+$/, "");
  const paymentTerms = input.paymentTerms.trim().replace(/\.+$/, "");

  return `CONSULTATION & SERVICES AGREEMENT

This Consultation & Services Agreement ("Agreement") is entered into as of ${input.effectiveDate} ("Effective Date"), by and between:

Ads by Shoaib, an independent performance marketing practice operated by Shoaib Nabi Noor, based in Multan, Punjab, Pakistan ("Consultant"),

and

${input.clientBusiness} ("Client"), represented by ${input.clientName}.

Collectively referred to as the "Parties."

This Agreement follows and incorporates Proposal ${input.proposalNumber}, accepted by the Client, which sets out the specific scope of work and fees referenced below.

1. Scope of Services
The Consultant will provide the services described in Proposal ${input.proposalNumber}: ${scopeOfWork}. Any work outside this scope will be discussed and agreed in writing (including by email) before it begins, and may involve additional fees.

2. Fees & Payment
Total fees for the services described are ${fee}, payable according to the terms set out in Proposal ${input.proposalNumber}: ${paymentTerms}. Late payments may result in a pause of services until accounts are settled.

3. Term & Termination
This Agreement begins on the Effective Date and continues until terminated by either Party. Either Party may terminate with 14 days' written notice (email is sufficient). Fees for work completed up to the termination date remain payable.

4. Client Responsibilities
The Client agrees to provide timely access, approvals, feedback, and any materials, accounts, or information reasonably required for the Consultant to perform the services. Delays caused by the Client may affect timelines and results.

5. Independent Contractor
The Consultant is an independent contractor, not an employee, partner, or agent of the Client. Nothing in this Agreement creates an employment, partnership, or joint venture relationship between the Parties.

6. Confidentiality
Each Party agrees to keep confidential any non-public business, financial, or technical information disclosed by the other Party in connection with this Agreement, and not to use or disclose it except as needed to perform this Agreement, both during and after its term.

7. Intellectual Property
Upon full payment, the Client owns the final creative assets, ad campaigns, and deliverables created specifically for the Client under this Agreement. The Consultant retains ownership of its own pre-existing tools, templates, methodologies, and know-how, and may reuse general skills and experience gained in future work for other clients.

8. Results & Liability
The Consultant will perform services with reasonable skill and care, informed by professional experience. Marketing outcomes (leads, sales, rankings, ad performance, etc.) depend on many factors outside the Consultant's control — including platform algorithm changes, market conditions, and the Client's own business — and are not guaranteed. The Consultant's total liability under this Agreement is limited to the fees paid by the Client in the three (3) months preceding the claim.

9. Governing Law
This Agreement is governed by the laws of Pakistan, and the Parties submit to the courts of Multan, Punjab for any disputes arising from it.

10. Entire Agreement
This Agreement, together with Proposal ${input.proposalNumber}, constitutes the entire understanding between the Parties regarding the services described, and supersedes any prior discussions or agreements on the same subject.

By signing below, both Parties agree to the terms of this Agreement.`;
}
