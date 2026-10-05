# Retainer billing + monthly client reports — plan (approved 2026-10-06)

## Goal
For every client whose proposal is accepted, the monthly retainer invoice is created automatically every month. It comes with a professional monthly report, and goes to the client after Shoaib reviews it with one click.

## Shoaib's decisions
| Question | Decision |
|---|---|
| Billing day | **1st of every month** for all clients: the invoice is for that month (in advance), and the report covers the previous month. The **first invoice** (one-time items + first month) is created when the agreement is signed (or the proposal is accepted). |
| Sending | **Draft first.** Invoice and report are created as drafts. Shoaib gets a "ready for review" notice and sends with one click. |
| Ad spend | **Not invoiced.** Clients pay Google and Meta directly; the invoice covers only Shoaib's fees, tools and services. Spend appears in the report only. |

## Build phases
1. **Retainers (data and UI)**
   - New `retainers` table:
     - client and proposal
     - monthly line items, copied from the proposal's `billing_type='monthly'` lines (services + monthly tools), with discount, GST and the tools tax applied as on the proposal
     - currency, start month, `next_invoice_date`
     - status: active / paused / ended
     - linked KB projects
   - Created automatically in the proposal-acceptance cascade (`performProposalAcceptance` / agreement signing). It can also be created manually from a proposal.
   - Dashboard **Retainers** section: list, edit lines and amount, pause, end.
2. **Monthly generation**
   - New endpoint `/api/billing/cron` (CRON_SECRET), triggered **daily** by GitHub Actions. Vercel Hobby rejects sub-daily crons; even a daily cron is safer in GH Actions.
   - On the 1st, for each active retainer: create the invoice for that month as a **draft**, then advance `next_invoice_date`.
   - Idempotent: unique `(retainer_id, period)`.
   - Line descriptions read "… — November 2026"; due date is issue date + 7 days.
3. **Monthly report**
   - New `client_reports` table: client, period, status draft/sent, token, sections JSON.
   - Built for the previous month from:
     - each linked KB project's `client-report-log-YYYY-MM` (work done)
     - Google Ads and Meta results (spend, impressions, clicks, conversions)
     - GA4 sessions and key events
     - GBP (calls, directions, reviews)
     - social posts published (planner)
   - Public token page `/report/[token]` in Ads by Shoaib branding, plus a PDF.
   - Pending items for the client come from the log.
   - Claude (MCP) can write or refine the summary paragraph on request.
4. **Review and send**
   - Dashboard notice and email to Shoaib: "N invoices + reports ready for review".
   - Each draft can be edited, then **Send**.
   - The client gets an email (Resend) with the invoice link and PDF, and the report link and PDF.
   - New public `/invoice/[token]` page: bank details, status.
5. **Client portal** (Shoaib, 2026-10-06)
   - When Shoaib presses **Send / OK**, the invoice and that month's report are published to the client's portal **at the same moment**.
   - New "Invoices & Reports" tab, visible to **both portal roles: Owner and Member**.
   - Drafts are never visible in the portal.
   - The portal shows status (Due / Paid / Overdue) and the full history of past invoices and reports.
   - The email goes to the client's email **and** every portal user (owner + members), with a link to the portal.
6. **Payments**
   - Mark Paid / Partially paid, which already exists on invoices.
   - Later: an automatic reminder when an invoice goes overdue.
7. **MCP tools**
   - `billing_list_drafts`, `billing_send`, `report_get` / `report_update_summary`.
   - Shipped on both the local and remote MCP.

## Notes
- Documents are snapshots: retainer edits never change invoices already issued.
- SQL migrations are added to `supabase/dashboard-schema.sql`. Shoaib runs them, or `scripts/run-sql.mjs` is used locally.
- Every new table gets `enable row level security`.
