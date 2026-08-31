-- ============================================================
-- Ads by Shoaib — Business dashboard schema
-- Run once in Supabase → SQL Editor.
-- Safe to re-run: every statement is IF NOT EXISTS / OR REPLACE.
-- ============================================================

-- ── Settings (single row, id is always 1) ───────────────────

create table if not exists settings (
  id int primary key default 1 check (id = 1),
  business_name text not null default 'Ads by Shoaib',
  business_email text default 'hello@adsbyshoaib.com',
  business_phone text default '+92 301 7461642',
  business_address text default 'Multan, Punjab, Pakistan',
  default_currency text not null default 'PKR',
  -- Tax defaults for NEW documents; each document stores its own snapshot
  tax_enabled boolean not null default false,
  tax_name text not null default 'GST',
  tax_rate numeric(5,2) not null default 0,
  invoice_prefix text not null default 'INV',
  quote_prefix text not null default 'QUO',
  proposal_prefix text not null default 'PRO',
  agreement_prefix text not null default 'AGR',
  payment_terms text default 'Payment due within 14 days of invoice date.',
  bank_details text,
  updated_at timestamptz not null default now()
);

insert into settings (id) values (1) on conflict (id) do nothing;

-- Safe to run against an already-existing settings table.
alter table settings add column if not exists proposal_prefix text not null default 'PRO';
alter table settings add column if not exists agreement_prefix text not null default 'AGR';

-- ── Clients ─────────────────────────────────────────────────

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,                    -- company or individual
  contact_person text,
  email text,
  phone text,
  address text,
  country text,
  currency text,                         -- preferred billing currency
  notes text,
  is_active boolean not null default true
);

create index if not exists clients_name_idx on clients (name);

-- A client's own separate projects/companies, defined once here and
-- picked from when building a Proposal, instead of retyping the same
-- project names every time. A Proposal's own proposal_projects row is
-- still its own copy (name/scope frozen at pick time) — this table is
-- just the source Shoaib picks from, not a live link.
create table if not exists client_projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  name text not null,
  notes text,
  sort_order int not null default 0
);

create index if not exists client_projects_parent_idx on client_projects (client_id);

alter table client_projects enable row level security;

-- ── Services catalog (line items for quotes/invoices) ───────
-- Distinct from the website's Services pages, which live in Sanity:
-- those are marketing copy; these are priced, billable items.

create table if not exists catalog_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  description text,
  unit text not null default 'month',    -- month / project / hour / item
  default_rate numeric(12,2) not null default 0,  -- "Standard Rate" in the UI — Shoaib's own reference figure
  currency text not null default 'PKR',
  is_active boolean not null default true,
  sort_order int not null default 0,
  -- A bundle is still just a catalog_items row (same name/rate/unit
  -- shape, so it drops into every "fill from catalog" dropdown with zero
  -- extra code) — is_bundle just means its price is a package price, and
  -- catalog_bundle_members below lists what's actually included, for
  -- Shoaib's own reference and the auto-filled description.
  is_bundle boolean not null default false,
  -- Whether picking this into a Proposal line defaults it to Monthly
  -- Retainer or One-time/Fixed — explicit rather than inferred from unit,
  -- since "per project" doesn't always mean one-time. Single Services
  -- only; bundles keep inferring from unit (CatalogForm hides the field
  -- for them) to avoid a second recurrence concept on top of the bundle
  -- price/members already there.
  billing_type text not null default 'one_time'
    check (billing_type in ('monthly','one_time'))
);

-- Reverted 2026-08-27 — Shoaib negotiates on the document total, not a
-- second per-item rate. Safe to run against an already-existing table
-- that still has the column from the brief window it existed.
alter table catalog_items drop column if exists discounted_rate;

alter table catalog_items add column if not exists is_bundle boolean not null default false;

alter table catalog_items add column if not exists billing_type text not null default 'one_time'
  check (billing_type in ('monthly','one_time'));
-- Backfill existing rows sensibly from their unit rather than leaving
-- every pre-existing service defaulted to one_time.
update catalog_items set billing_type = 'monthly' where unit = 'month';

-- A bundle can't include another bundle (checked in the app, not here)
-- — keeps "what's included" a flat, one-level list.
create table if not exists catalog_bundle_members (
  bundle_id uuid not null references catalog_items (id) on delete cascade,
  member_id uuid not null references catalog_items (id) on delete cascade,
  primary key (bundle_id, member_id)
);

alter table catalog_bundle_members enable row level security;

-- ── Document numbering ──────────────────────────────────────
-- Sequential per type per year, e.g. INV-2026-001.
-- A counters table + locking function keeps the sequence gap-free
-- even if two documents are created at the same moment.

create table if not exists document_counters (
  doc_type text not null,                -- 'invoice' | 'quotation'
  year int not null,
  last_number int not null default 0,
  primary key (doc_type, year)
);

create or replace function next_document_number(p_doc_type text, p_year int)
returns int
language plpgsql
as $$
declare
  v_next int;
begin
  insert into document_counters (doc_type, year, last_number)
  values (p_doc_type, p_year, 1)
  on conflict (doc_type, year)
    do update set last_number = document_counters.last_number + 1
  returning last_number into v_next;

  return v_next;
end;
$$;

-- ── Proposals ───────────────────────────────────────────────
-- Client-capturing funnel: Proposal (this) → prospect accepts, which IS
-- the agreement (no separate contract/signing step in v1 — the terms
-- below become binding on acceptance) → Onboarding intake. client_id is
-- nullable because a proposal is often sent to someone who isn't a Client
-- row yet; prospect_name/email/business are the source of truth until
-- acceptance auto-creates (or links to an existing) client.

create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  number text not null unique,
  client_id uuid references clients (id) on delete set null,
  prospect_name text not null,
  prospect_email text not null,
  prospect_business text,
  status text not null default 'draft'
    check (status in ('draft','sent','viewed','accepted','declined','expired')),
  -- Narrative sections — the "solution-based, not a fixed package" pitch.
  situation text,
  proposed_solution text,
  scope_of_work text,
  currency text not null default 'PKR',
  -- A client-specific break on the whole document, applied to the
  -- subtotal before tax — separate from any per-line rate, since Shoaib
  -- prices line items at his standard rate and negotiates on the total.
  discount_enabled boolean not null default false,
  discount_type text not null default 'percentage'
    check (discount_type in ('percentage','fixed')),
  discount_value numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  tax_enabled boolean not null default false,
  tax_name text not null default 'GST',
  tax_rate numeric(5,2) not null default 0,
  -- Estimated international-transaction surcharge Pakistani accounts get
  -- charged on international card purchases (tool subscriptions billed
  -- in foreign currency) — applied to tool line items only, on top of
  -- the tax above, not discountable. The rate drifts with the bank, so
  -- it's editable per proposal rather than a fixed constant.
  tools_tax_enabled boolean not null default false,
  tools_tax_rate numeric(5,2) not null default 18,
  tools_tax_amount numeric(12,2) not null default 0,
  subtotal numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  terms text,                            -- becomes binding once accepted
  access_token text not null unique,
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  -- Simple in-app e-signature captured on acceptance.
  signer_name text,
  signed_at timestamptz,
  signer_ip text
);

-- Safe to run against an already-existing proposals table.
alter table proposals add column if not exists discount_enabled boolean not null default false;
alter table proposals add column if not exists discount_type text not null default 'percentage'
  check (discount_type in ('percentage','fixed'));
alter table proposals add column if not exists discount_value numeric(12,2) not null default 0;
alter table proposals add column if not exists discount_amount numeric(12,2) not null default 0;
alter table proposals add column if not exists tools_tax_enabled boolean not null default false;
alter table proposals add column if not exists tools_tax_rate numeric(5,2) not null default 18;
alter table proposals add column if not exists tools_tax_amount numeric(12,2) not null default 0;

create index if not exists proposals_client_idx on proposals (client_id);
create index if not exists proposals_status_idx on proposals (status);
create index if not exists proposals_token_idx on proposals (access_token);

-- One client's proposal can cover more than one project or company (e.g.
-- a client who owns two separate businesses) — each gets its own name,
-- own short scope note, and its own line items below, while pricing,
-- discount/tax, and accept/sign still happen once for the whole proposal.
-- Optional: a proposal with none of these behaves exactly as a single
-- flat proposal always has.
create table if not exists proposal_projects (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals (id) on delete cascade,
  name text not null,
  scope_of_work text,
  sort_order int not null default 0
);

create index if not exists proposal_projects_parent_idx on proposal_projects (proposal_id);

create table if not exists proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals (id) on delete cascade,
  catalog_item_id uuid references catalog_items (id) on delete set null,
  description text not null,
  quantity numeric(10,2) not null default 1,
  rate numeric(12,2) not null default 0,
  -- Purely presentational grouping on the client-facing document —
  -- doesn't change the maths, just tells the client which lines recur
  -- monthly vs. which are a one-off setup/fixed charge.
  billing_type text not null default 'one_time'
    check (billing_type in ('monthly','one_time')),
  -- 'tool' = a third-party subscription Shoaib is passing through
  -- (Claude Pro, Canva, ad tools, etc.) — separate section on the
  -- document from his own 'service' fees, and the only kind of line the
  -- international-transaction tax estimate above applies to.
  item_type text not null default 'service'
    check (item_type in ('service','tool')),
  -- Null = general/shared, not tied to one project.
  project_id uuid references proposal_projects (id) on delete cascade,
  amount numeric(12,2) not null default 0,
  sort_order int not null default 0
);

-- Safe to run against an already-existing proposal_items table.
alter table proposal_items add column if not exists billing_type text not null default 'one_time'
  check (billing_type in ('monthly','one_time'));
alter table proposal_items add column if not exists item_type text not null default 'service'
  check (item_type in ('service','tool'));
alter table proposal_items add column if not exists project_id uuid
  references proposal_projects (id) on delete cascade;

create index if not exists proposal_items_parent_idx on proposal_items (proposal_id);

-- ── Onboarding intakes ──────────────────────────────────────
-- One per accepted proposal — a structured, client-facing form (not just
-- internal notes) so the client hands over what's needed without a back
-- and forth. access_token gives the client a no-login link, same pattern
-- as proposals.

create table if not exists onboarding_intakes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  proposal_id uuid not null references proposals (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  access_token text not null unique,
  status text not null default 'pending' check (status in ('pending','submitted')),
  business_overview text,
  current_channels text,
  goals text,
  brand_assets_links text,
  access_notes text,
  additional_notes text,
  submitted_at timestamptz
);

create index if not exists onboarding_intakes_proposal_idx on onboarding_intakes (proposal_id);
create index if not exists onboarding_intakes_token_idx on onboarding_intakes (access_token);

-- ── Client intakes ──────────────────────────────────────────
-- On-demand information requests Shoaib sends a client (via link /
-- WhatsApp / email) to collect what's needed to set their social accounts
-- up: business details, competitors, brand assets, and so on. Unlike
-- onboarding_intakes (auto-created when an agreement is signed), these are
-- created by hand for any client at any time. Uploaded files live in
-- S3-compatible object storage (Cloudflare R2 / Backblaze B2 / Storj) —
-- only their metadata is kept here in `assets`.
create table if not exists client_intakes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Optional link to a client record; a business name is always captured
  -- so an intake can be sent before a formal client row exists.
  client_id uuid references clients (id) on delete set null,
  business_name text not null,
  access_token text not null unique,
  status text not null default 'pending' check (status in ('pending','submitted')),
  -- The client can keep editing their submission until Shoaib locks it from
  -- the dashboard; once locked, the public form is read-only.
  locked boolean not null default false,
  -- Collected fields — all optional, the client fills what they can.
  contact_name text,
  contact_emails text,
  contact_phone text,
  address text,
  website text,
  social_handles text,
  competitors text,
  target_audience text,
  brand_notes text,           -- colours, fonts, voice, do's and don'ts
  account_access_notes text,  -- existing accounts / who currently has access
  brand_asset_links text,     -- Drive / Dropbox / WeTransfer links
  -- Files uploaded straight to object storage: [{ key, name, size, type,
  -- kind }] — kind is "logo" or "media".
  assets jsonb not null default '[]'::jsonb,
  additional_notes text,
  -- Richer intake fields (added 2026-08-28 for the multi-step form). All
  -- optional text; multi-value ones are stored comma-separated.
  contact_role text,        -- designation
  whatsapp text,
  registered_name text,     -- client's registered business name
  operating_days text,      -- "Mon, Tue, ..."
  hours_open text,
  hours_close text,
  service_areas text,       -- cities / regions, comma-separated
  landmark text,
  brand_colors text,        -- hex values, comma-separated
  platforms text,           -- preferred social platforms, comma-separated
  master_email text,        -- master Gmail for asset assignment
  submitted_at timestamptz
);

create index if not exists client_intakes_client_idx on client_intakes (client_id);
create index if not exists client_intakes_token_idx on client_intakes (access_token);

alter table client_intakes enable row level security;

-- Safe to run against an already-existing client_intakes table.
alter table client_intakes add column if not exists locked boolean not null default false;
alter table client_intakes add column if not exists contact_role text;
alter table client_intakes add column if not exists whatsapp text;
alter table client_intakes add column if not exists registered_name text;
alter table client_intakes add column if not exists operating_days text;
alter table client_intakes add column if not exists hours_open text;
alter table client_intakes add column if not exists hours_close text;
alter table client_intakes add column if not exists service_areas text;
alter table client_intakes add column if not exists landmark text;
alter table client_intakes add column if not exists brand_colors text;
alter table client_intakes add column if not exists platforms text;
alter table client_intakes add column if not exists master_email text;

-- ── Agreements ──────────────────────────────────────────────
-- Generated automatically when a proposal is accepted. content is a
-- FROZEN snapshot (rendered from lib/dashboard/agreement-template.ts at
-- creation time) — same immutability rule as tax/currency snapshots on
-- quotations/invoices below: editing the master template later must never
-- rewrite an agreement a client has already been sent or has signed.

create table if not exists agreements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  number text not null unique,
  proposal_id uuid not null references proposals (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  -- Legacy frozen text blob — agreements created before clauses existed
  -- keep rendering from this, untouched, forever (documents are
  -- snapshots). New agreements populate `clauses` instead and leave this
  -- null.
  content text,
  -- Structured, editable clauses: [{ title, body, showInvestmentSummary? }].
  -- Lets Shoaib edit wording and add clauses per agreement, and anchors
  -- the Investment Summary to whichever clause it's most relevant to
  -- (Fees & Payment, by default) instead of a disconnected block above
  -- the whole document. Null on legacy rows.
  clauses jsonb,
  status text not null default 'draft'
    check (status in ('draft','sent','viewed','signed','declined')),
  access_token text not null unique,
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  declined_at timestamptz,
  signer_name text,
  signer_ip text
);

create index if not exists agreements_proposal_idx on agreements (proposal_id);
create index if not exists agreements_client_idx on agreements (client_id);
create index if not exists agreements_token_idx on agreements (access_token);

alter table agreements alter column content drop not null;
alter table agreements add column if not exists clauses jsonb;

-- ── Quotations ──────────────────────────────────────────────
-- tax_enabled / tax_rate / currency are SNAPSHOTS taken when the
-- document is created. Changing settings later must never rewrite
-- the totals on a document already sent to a client.

create table if not exists quotations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  number text not null unique,
  client_id uuid not null references clients (id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft','sent','accepted','rejected','expired')),
  issue_date date not null default current_date,
  valid_until date,
  currency text not null default 'PKR',
  discount_enabled boolean not null default false,
  discount_type text not null default 'percentage'
    check (discount_type in ('percentage','fixed')),
  discount_value numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  tax_enabled boolean not null default false,
  tax_name text not null default 'GST',
  tax_rate numeric(5,2) not null default 0,
  subtotal numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text,
  terms text,
  accepted_at timestamptz,
  rejected_at timestamptz
);

-- Safe to run against an already-existing quotations table.
alter table quotations add column if not exists discount_enabled boolean not null default false;
alter table quotations add column if not exists discount_type text not null default 'percentage'
  check (discount_type in ('percentage','fixed'));
alter table quotations add column if not exists discount_value numeric(12,2) not null default 0;
alter table quotations add column if not exists discount_amount numeric(12,2) not null default 0;

create index if not exists quotations_client_idx on quotations (client_id);
create index if not exists quotations_status_idx on quotations (status);

create table if not exists quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations (id) on delete cascade,
  catalog_item_id uuid references catalog_items (id) on delete set null,
  description text not null,
  quantity numeric(10,2) not null default 1,
  rate numeric(12,2) not null default 0,
  amount numeric(12,2) not null default 0,
  sort_order int not null default 0
);

create index if not exists quotation_items_parent_idx on quotation_items (quotation_id);

-- ── Invoices ────────────────────────────────────────────────

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  number text not null unique,
  client_id uuid not null references clients (id) on delete restrict,
  -- Set when an invoice is generated from an accepted quotation
  quotation_id uuid references quotations (id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft','sent','partially_paid','paid','overdue','cancelled')),
  issue_date date not null default current_date,
  due_date date,
  currency text not null default 'PKR',
  tax_enabled boolean not null default false,
  tax_name text not null default 'GST',
  tax_rate numeric(5,2) not null default 0,
  subtotal numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  notes text,
  terms text,
  sent_at timestamptz,
  paid_at timestamptz
);

create index if not exists invoices_client_idx on invoices (client_id);
create index if not exists invoices_status_idx on invoices (status);

create table if not exists invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  catalog_item_id uuid references catalog_items (id) on delete set null,
  description text not null,
  quantity numeric(10,2) not null default 1,
  rate numeric(12,2) not null default 0,
  amount numeric(12,2) not null default 0,
  sort_order int not null default 0
);

create index if not exists invoice_items_parent_idx on invoice_items (invoice_id);

-- ── Payments (supports partial payment) ─────────────────────

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  amount numeric(12,2) not null,
  paid_at date not null default current_date,
  method text,                            -- bank transfer / cash / Wise / etc.
  reference text,
  notes text
);

create index if not exists payments_invoice_idx on payments (invoice_id);

-- ── Row Level Security ──────────────────────────────────────
-- Enabled with no policies: the anon key can reach nothing. The
-- dashboard reads and writes server-side with the service_role key,
-- behind its own auth check, so no client ever queries these directly.

alter table settings enable row level security;
alter table clients enable row level security;
alter table catalog_items enable row level security;
alter table document_counters enable row level security;
alter table proposals enable row level security;
alter table proposal_projects enable row level security;
alter table proposal_items enable row level security;
alter table agreements enable row level security;
alter table onboarding_intakes enable row level security;
alter table quotations enable row level security;
alter table quotation_items enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table payments enable row level security;

-- ── Password vault (zero-knowledge) ─────────────────────────
-- A NordPass-style vault for client credentials. EVERYTHING sensitive is
-- encrypted in the BROWSER (AES-256-GCM) with a key that never touches the
-- server — Supabase only ever stores ciphertext and wrapped keys, so a DB
-- leak exposes nothing usable. See lib/vault-crypto.ts.

-- Single row (id = 1): the crypto material needed to unlock. The data key
-- is wrapped twice — once by the master password, once by a recovery key
-- shown to Shoaib only at setup. None of these are secret on their own.
create table if not exists vault_meta (
  id int primary key default 1 check (id = 1),
  created_at timestamptz not null default now(),
  salt text not null,
  iterations int not null,
  wrapped_dk text not null,
  wrapped_dk_iv text not null,
  wrapped_dk_recovery text not null,
  wrapped_dk_recovery_iv text not null
);

alter table vault_meta enable row level security;

create table if not exists vault_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Non-secret, for listing/linking only.
  client_id uuid references clients (id) on delete set null,
  title text not null,
  service text,
  -- The encrypted payload: { username, password, totp, backupCodes,
  -- recoveryEmail, recoveryPhone, securityQa, url, notes }. Opaque to the
  -- server.
  ciphertext text not null,
  iv text not null
);

create index if not exists vault_entries_client_idx on vault_entries (client_id);

alter table vault_entries enable row level security;

-- ── Rate limiting ───────────────────────────────────────────
-- Shared, atomic per-key request counter for public endpoints (contact,
-- newsletter, intake uploads) — serverless instances don't share memory,
-- so the limiter lives in the DB. check_rate_limit() increments (or resets
-- once the window passes) and returns whether the request is allowed.
create table if not exists rate_limits (
  key text primary key,
  count int not null default 0,
  window_start timestamptz not null default now()
);

alter table rate_limits enable row level security;

create or replace function check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
as $$
declare
  v_count int;
begin
  insert into rate_limits (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update set
    count = case
      when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then 1
      else rate_limits.count + 1
    end,
    window_start = case
      when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then now()
      else rate_limits.window_start
    end
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;
