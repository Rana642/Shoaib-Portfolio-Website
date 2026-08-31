/** Crypto material to unlock the zero-knowledge vault. None of this is
 *  secret on its own — the data key is only recoverable with the master
 *  password or the recovery key, neither of which is ever stored. */
export type VaultMeta = {
  id: number;
  salt: string;
  iterations: number;
  wrapped_dk: string;
  wrapped_dk_iv: string;
  wrapped_dk_recovery: string;
  wrapped_dk_recovery_iv: string;
};

/** A vault entry as stored — the sensitive payload lives encrypted in
 *  `ciphertext`; only the title/service/client link are plaintext. */
export type VaultEntry = {
  id: string;
  created_at: string;
  updated_at: string;
  client_id: string | null;
  title: string;
  service: string | null;
  ciphertext: string;
  iv: string;
};

/** The decrypted shape inside a vault entry's ciphertext (browser only). */
export type VaultSecret = {
  username?: string;
  password?: string;
  totp?: string;
  backupCodes?: string;
  recoveryEmail?: string;
  recoveryPhone?: string;
  securityQa?: string;
  url?: string;
  notes?: string;
};

export type Client = {
  id: string;
  created_at: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  country: string | null;
  currency: string | null;
  notes: string | null;
  is_active: boolean;
};

export type ClientProject = {
  id: string;
  client_id: string;
  name: string;
  notes: string | null;
  sort_order: number;
};

export type CatalogItem = {
  id: string;
  created_at: string;
  name: string;
  description: string | null;
  unit: string;
  default_rate: number;
  currency: string;
  is_active: boolean;
  sort_order: number;
  is_bundle: boolean;
  billing_type: "monthly" | "one_time";
};

export type LineItem = {
  id: string;
  catalog_item_id: string | null;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  sort_order: number;
};

export type ProposalStatus = "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired";

export type Proposal = {
  id: string;
  created_at: string;
  updated_at: string;
  number: string;
  client_id: string | null;
  prospect_name: string;
  prospect_email: string;
  prospect_business: string | null;
  status: ProposalStatus;
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
  tools_tax_enabled: boolean;
  tools_tax_rate: number;
  tools_tax_amount: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  terms: string | null;
  access_token: string;
  sent_at: string | null;
  viewed_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  signer_name: string | null;
  signed_at: string | null;
  signer_ip: string | null;
};

export type AgreementStatus = "draft" | "sent" | "viewed" | "signed" | "declined";

/** One editable section of an Agreement's legal text. At most one clause
 *  should carry `showInvestmentSummary` — that's where the pricing
 *  breakdown renders, right after it (Fees & Payment, by default). */
export type AgreementClause = {
  title: string;
  body: string;
  showInvestmentSummary?: boolean;
};

export type Agreement = {
  id: string;
  created_at: string;
  updated_at: string;
  number: string;
  proposal_id: string;
  client_id: string;
  /** Legacy frozen text blob — null on agreements created after `clauses`
   *  shipped, populated (and rendered as-is, forever) on older ones. */
  content: string | null;
  /** Structured, editable clauses — null on legacy agreements. */
  clauses: AgreementClause[] | null;
  status: AgreementStatus;
  access_token: string;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  declined_at: string | null;
  signer_name: string | null;
  signer_ip: string | null;
};

export type OnboardingStatus = "pending" | "submitted";

export type OnboardingIntake = {
  id: string;
  created_at: string;
  proposal_id: string;
  client_id: string;
  access_token: string;
  status: OnboardingStatus;
  business_overview: string | null;
  current_channels: string | null;
  goals: string | null;
  brand_assets_links: string | null;
  access_notes: string | null;
  additional_notes: string | null;
  submitted_at: string | null;
};

/** One file the client uploaded to object storage. `key` is the storage
 *  object key; the file itself lives in R2/B2/Storj, not the database. */
export type IntakeAsset = {
  key: string;
  name: string;
  size: number;
  type: string;
  /** "logo" or "media" — which upload zone it came from. */
  kind?: "logo" | "media";
};

export type ClientIntake = {
  id: string;
  created_at: string;
  client_id: string | null;
  business_name: string;
  access_token: string;
  status: OnboardingStatus;
  locked: boolean;
  contact_name: string | null;
  contact_role: string | null;
  contact_emails: string | null;
  contact_phone: string | null;
  whatsapp: string | null;
  registered_name: string | null;
  address: string | null;
  website: string | null;
  operating_days: string | null;
  hours_open: string | null;
  hours_close: string | null;
  service_areas: string | null;
  landmark: string | null;
  brand_colors: string | null;
  target_audience: string | null;
  brand_notes: string | null;
  social_handles: string | null;
  competitors: string | null;
  platforms: string | null;
  master_email: string | null;
  account_access_notes: string | null;
  brand_asset_links: string | null;
  assets: IntakeAsset[];
  additional_notes: string | null;
  submitted_at: string | null;
};

export type QuotationStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

export type Quotation = {
  id: string;
  created_at: string;
  updated_at: string;
  number: string;
  client_id: string;
  status: QuotationStatus;
  issue_date: string;
  valid_until: string | null;
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
  notes: string | null;
  terms: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
};

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "cancelled";

export type Invoice = {
  id: string;
  created_at: string;
  updated_at: string;
  number: string;
  client_id: string;
  quotation_id: string | null;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string | null;
  currency: string;
  tax_enabled: boolean;
  tax_name: string;
  tax_rate: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  notes: string | null;
  terms: string | null;
  sent_at: string | null;
  paid_at: string | null;
};

export type Payment = {
  id: string;
  created_at: string;
  invoice_id: string;
  amount: number;
  paid_at: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
};

export type Settings = {
  id: number;
  business_name: string;
  business_email: string | null;
  business_phone: string | null;
  business_address: string | null;
  default_currency: string;
  tax_enabled: boolean;
  tax_name: string;
  tax_rate: number;
  invoice_prefix: string;
  quote_prefix: string;
  proposal_prefix: string;
  agreement_prefix: string;
  payment_terms: string | null;
  bank_details: string | null;
  updated_at: string;
};

export const CURRENCIES = ["PKR", "USD", "EUR", "GBP", "SEK", "AED"] as const;

export const UNITS = ["month", "project", "hour", "item", "campaign"] as const;
