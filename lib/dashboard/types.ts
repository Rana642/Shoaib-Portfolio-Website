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
  /** Keypair for client-portal submissions (null until first unlock after
   *  the portal shipped): public key plaintext, private key wrapped by DK. */
  public_key: string | null;
  wrapped_private_key: string | null;
  wrapped_private_key_iv: string | null;
};

/** Logins a client sent from the portal, sealed to the vault's public key.
 *  `platforms` is plaintext only to drive the client's status list. */
export type VaultSubmission = {
  id: string;
  created_at: string;
  client_id: string;
  project_id: string | null;
  platforms: string[];
  wrapped_key: string;
  ciphertext: string;
  iv: string;
  status: "received" | "imported";
  imported_at: string | null;
};

/** An account Shoaib has asked a client for, via the portal. */
export type VaultRequest = {
  id: string;
  created_at: string;
  client_id: string;
  project_id: string | null;
  platform: string;
  note: string | null;
  fulfilled_at: string | null;
};

/** A vault entry as stored. Everything describing the account — title,
 *  platform, every field — is inside `ciphertext` (shape: VaultSecret in
 *  lib/vault-platforms.ts); only the client/project links are plaintext.
 *  `title`/`service` are legacy columns, written as ''/null. */
export type VaultEntry = {
  id: string;
  created_at: string;
  updated_at: string;
  client_id: string | null;
  project_id: string | null;
  title: string;
  service: string | null;
  ciphertext: string;
  iv: string;
  /** Kept out of the client portal Owner's Passwords tab. */
  portal_hidden?: boolean;
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

export type SocialPlatform = "facebook" | "instagram" | "linkedin" | "tiktok";

/** A client_projects row flattened with its parent client's name, for
 *  project-picker dropdowns across the social poster UI/MCP. Social
 *  accounts and scheduled posts bind to the project, not the client
 *  directly — a client can run several separate businesses. */
export type ProjectOption = {
  id: string;
  /** What pickers show: the project name alone (Shoaib, 2026-10-02 — no
   *  client name next to projects); "Project · Client" only when two
   *  projects share a name. */
  label: string;
  /** The project's own name and its client's, for search/matching. */
  name: string;
  client: string;
  client_id: string;
};

export type ClientSocialAccount = {
  id: string;
  created_at: string;
  project_id: string;
  platform: SocialPlatform;
  label: string;
  external_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  is_active: boolean;
};

/** "needs_changes" = held: the upload has a mistake the uploader must fix
 *  (review_note says what) before it can get a caption. */
export type ScheduledPostStatus = "pending_caption" | "needs_changes" | "scheduled" | "posted" | "failed";

export type ScheduledPost = {
  id: string;
  created_at: string;
  project_id: string;
  media_key: string;
  original_filename: string;
  caption: string | null;
  scheduled_at: string | null;
  status: ScheduledPostStatus;
  result: Record<string, unknown> | null;
  posted_at: string | null;
  /** null = every active connected account for the project; otherwise
   *  restricts publishing to just these platforms. */
  target_platforms: string[] | null;
  /** Set when a client (or their team) uploaded it from the portal. */
  uploaded_by_email?: string | null;
  client_note?: string | null;
  /** "reel" = media_key is a video, posted as a Facebook/Instagram Reel;
   *  absent/"post" = a photo post. ("story" is reserved for Stories.) */
  post_type?: PostType;
  /** Optional cover image for a Reel. */
  cover_key?: string | null;
  /** What has to change, while status is "needs_changes" (plain English,
   *  shown to the uploader). */
  review_note?: string | null;
  review_flagged_at?: string | null;
};

export type PostType = "post" | "reel" | "story";

export type ClientProject = {
  id: string;
  client_id: string;
  name: string;
  notes: string | null;
  /** Business-specific posting style guide — emoji use, tone, language,
   *  do's and don'ts. Read by the social MCP tools so caption-writing
   *  follows each business's voice without being told every time. */
  posting_instructions: string | null;
  /** Where the business is — the Planner shows this city's weather. */
  city?: string | null;
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
  /** e.g. "posts" — makes Proposal lines show a count stepper. */
  count_label: string | null;
  /** The count included at the standard rate, e.g. 16. */
  count_default: number | null;
};

export type LineItem = {
  id: string;
  catalog_item_id: string | null;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  sort_order: number;
  /** Shown with its value and a "Complimentary" label, never charged. */
  is_complimentary?: boolean;
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
  /** The date printed on the proposal; null = its created_at date. */
  proposal_date?: string | null;
  valid_until?: string | null;
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
  /** Kept on file but left out of the agreement everywhere it shows
   *  (dashboard, the client's link, print). */
  hidden?: boolean;
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
  /** Added 2026-09-26 with the one-page setup form. */
  business_overview: string | null;
  usp: string | null;
  design_references: string | null;
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
  /** Set when generated from a monthly retainer. */
  retainer_id?: string | null;
  /** 'YYYY-MM' — the month a retainer invoice bills. */
  period?: string | null;
  /** Public /invoice/[token] link. */
  access_token?: string;
};

export type RetainerStatus = "active" | "paused" | "ended";

export type Retainer = {
  id: string;
  created_at: string;
  updated_at: string;
  client_id: string;
  proposal_id: string | null;
  name: string;
  status: RetainerStatus;
  currency: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  tax_enabled: boolean;
  tax_name: string;
  tax_rate: number;
  tools_tax_enabled: boolean;
  tools_tax_rate: number;
  start_date: string;
  next_invoice_date: string | null;
  end_date: string | null;
  due_days: number;
  notes: string | null;
};

export type RetainerItem = {
  id: string;
  retainer_id: string;
  catalog_item_id: string | null;
  description: string;
  quantity: number;
  rate: number;
  item_type: "service" | "tool";
  /** Unticked = stays on the retainer but isn't billed (optional tools). */
  included: boolean;
  sort_order: number;
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

/** A named API credential set (Google Ads, Meta Marketing API, GA4, GTM,
 *  GSC, GMB, or a custom service) — the API Vault, kept deliberately
 *  separate from the zero-knowledge password vault. `fields` maps a
 *  plaintext field name (e.g. "developer_token") to its AES-256-GCM
 *  ciphertext — never the plaintext value itself. */
export type ApiCredential = {
  id: string;
  created_at: string;
  updated_at: string;
  service: string;
  label: string;
  fields: Record<string, string>;
  notes: string | null;
  is_active: boolean;
};

/** A letter written on the A4 letterhead. `body` is the editor's HTML,
 *  limited to a small formatting whitelist (lib/dashboard/letter-html.ts);
 *  `title` only labels it in the list and never prints. */
export type Letter = {
  id: string;
  created_at: string;
  updated_at: string;
  ref_no: string;
  title: string;
  /** null = no date yet: the letter prints "Date: ____". */
  letter_date: string | null;
  /** The ref printed on the letter, typed by hand; "" prints "Ref: ____".
   *  Missing until the print_ref column is added. */
  print_ref?: string;
  show_meta: boolean;
  body: string;
};

/** A known service preset — just suggests field names when adding a new
 *  credential; any service can still be entered freely as "custom". */
export type ApiServicePreset = {
  value: string;
  label: string;
  suggestedFields: string[];
};

export const API_SERVICE_PRESETS: ApiServicePreset[] = [
  {
    value: "google_ads",
    label: "Google Ads API",
    suggestedFields: ["developer_token", "client_id", "client_secret", "refresh_token", "customer_id"],
  },
  {
    value: "meta_marketing",
    label: "Meta Marketing API",
    suggestedFields: ["app_id", "app_secret", "access_token", "ad_account_id"],
  },
  {
    value: "meta_posting",
    label: "Meta Posting API (Facebook/Instagram)",
    suggestedFields: ["app_id", "app_secret", "access_token"],
  },
  {
    value: "instagram_login",
    label: "Instagram API (Instagram Login)",
    suggestedFields: ["app_id", "app_secret"],
  },
  {
    value: "ga4",
    label: "Google Analytics 4 (GA4)",
    suggestedFields: ["client_id", "client_secret", "refresh_token", "property_id"],
  },
  {
    value: "gtm",
    label: "Google Tag Manager (GTM)",
    suggestedFields: ["client_id", "client_secret", "refresh_token", "container_id"],
  },
  {
    value: "gsc",
    label: "Google Search Console (GSC)",
    suggestedFields: ["client_id", "client_secret", "refresh_token", "site_url"],
  },
  {
    value: "linkedin_personal",
    label: "LinkedIn — personal profile posting (Share on LinkedIn app)",
    suggestedFields: ["client_id", "client_secret"],
  },
  {
    value: "gmb",
    label: "Google Business Profile (GBP/GMB)",
    suggestedFields: ["client_id", "client_secret", "refresh_token"],
  },
  {
    value: "whatsapp",
    label: "WhatsApp Cloud API (Socially Snap app)",
    suggestedFields: ["app_id", "app_secret", "access_token", "waba_id", "phone_number_id", "config_id"],
  },
  { value: "custom", label: "Custom / other", suggestedFields: ["api_key"] },
];

export const CURRENCIES = ["PKR", "USD", "EUR", "GBP", "SEK", "AED"] as const;

export const UNITS = ["month", "project", "hour", "item", "campaign"] as const;
