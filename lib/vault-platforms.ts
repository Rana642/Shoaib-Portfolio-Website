/**
 * What a password-vault entry looks like, per platform. A Facebook page has
 * no password (access comes from an admin profile), a hosting account has
 * two logins, Google Ads signs in through a Google account — so each
 * platform lists its own fields and the entry form renders whatever the
 * chosen platform needs. This file only describes the SHAPE of an entry;
 * the values exist decrypted in the browser alone (lib/vault-crypto.ts).
 */

import { passwordStrength } from "./password-generator";

export type FieldKind = "text" | "email" | "phone" | "url" | "secret" | "multiline" | "date";

export type FieldDef = {
  id: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  /** Takes a sign-in email — can be linked to a Gmail saved in the vault. */
  linkable?: boolean;
};

export type PlatformId =
  | "facebook_profile"
  | "facebook_page"
  | "instagram"
  | "meta_business"
  | "google_account"
  | "google_ads"
  | "google_analytics"
  | "google_business"
  | "tiktok"
  | "youtube"
  | "linkedin"
  | "whatsapp_business"
  | "website_hosting"
  | "domain"
  | "other";

export type PlatformDef = {
  id: PlatformId;
  label: string;
  fields: FieldDef[];
  /** Has a sign-in of its own → shows the 2-step verification & recovery
   *  section. Platforms reached through another account don't. */
  signIn: boolean;
  /** The field that identifies the account in the list. */
  primary: string;
  /** Shown on the card — e.g. why there's no password field. */
  note?: string;
};

const login: FieldDef = { id: "login", label: "Login email or phone", kind: "text", placeholder: "name@gmail.com", linkable: true };
const password: FieldDef = { id: "password", label: "Password", kind: "secret" };

export const PLATFORMS: PlatformDef[] = [
  {
    id: "facebook_profile",
    label: "Facebook profile",
    signIn: true,
    primary: "profile_link",
    fields: [
      { id: "profile_link", label: "Profile link", kind: "url", placeholder: "facebook.com/…" },
      login,
      password,
    ],
  },
  {
    id: "facebook_page",
    label: "Facebook page",
    signIn: false,
    primary: "page_link",
    note: "Pages don't have a password — access comes from an admin profile.",
    fields: [
      { id: "page_link", label: "Page link", kind: "url", placeholder: "facebook.com/…" },
      { id: "page_id", label: "Page ID", kind: "text" },
      { id: "admin_profiles", label: "Admin profile(s)", kind: "multiline", placeholder: "Which Facebook profiles manage this page" },
    ],
  },
  {
    id: "instagram",
    label: "Instagram",
    signIn: true,
    primary: "username",
    fields: [
      { id: "username", label: "Username", kind: "text", placeholder: "@handle" },
      login,
      password,
      { id: "linked_page", label: "Linked Facebook page", kind: "text" },
    ],
  },
  {
    id: "meta_business",
    label: "Meta Business",
    signIn: false,
    primary: "business_id",
    note: "Opened through a Facebook profile that's an admin or partner.",
    fields: [
      { id: "business_id", label: "Business portfolio ID", kind: "text" },
      { id: "dataset_id", label: "Pixel / dataset ID", kind: "text" },
      { id: "ad_accounts", label: "Ad account ID(s)", kind: "multiline" },
      { id: "admins", label: "Admins / partners", kind: "multiline" },
    ],
  },
  {
    id: "google_account",
    label: "Gmail / Google",
    signIn: true,
    primary: "email",
    fields: [{ id: "email", label: "Google email", kind: "email", placeholder: "name@gmail.com" }, password],
  },
  {
    id: "google_ads",
    label: "Google Ads",
    signIn: false,
    primary: "customer_id",
    note: "Signs in with a Google account — save that one under Gmail / Google.",
    fields: [
      { id: "customer_id", label: "Customer ID", kind: "text", placeholder: "123-456-7890" },
      { id: "login_email", label: "Sign-in Google account", kind: "email", linkable: true },
      { id: "manager_id", label: "Manager (MCC) ID", kind: "text" },
    ],
  },
  {
    id: "google_analytics",
    label: "GA4 / Tag Manager / Search Console",
    signIn: false,
    primary: "ga4_property",
    note: "Signs in with a Google account — save that one under Gmail / Google.",
    fields: [
      { id: "ga4_property", label: "GA4 property ID", kind: "text" },
      { id: "gtm_container", label: "GTM container ID", kind: "text", placeholder: "GTM-XXXXXXX" },
      { id: "search_console", label: "Search Console property", kind: "url" },
      { id: "access_email", label: "Access given to", kind: "email", linkable: true },
    ],
  },
  {
    id: "google_business",
    label: "Google Business Profile",
    signIn: false,
    primary: "profile_link",
    note: "Signs in with a Google account — save that one under Gmail / Google.",
    fields: [
      { id: "profile_link", label: "Business Profile link", kind: "url" },
      { id: "owner_email", label: "Owner email", kind: "email", linkable: true },
      { id: "managers", label: "Managers", kind: "multiline" },
    ],
  },
  {
    id: "tiktok",
    label: "TikTok",
    signIn: true,
    primary: "username",
    fields: [
      { id: "username", label: "Username", kind: "text", placeholder: "@handle" },
      login,
      password,
      { id: "business_center_id", label: "Business Center ID", kind: "text" },
      { id: "ad_account_id", label: "Ad account ID", kind: "text" },
    ],
  },
  {
    id: "youtube",
    label: "YouTube",
    signIn: false,
    primary: "channel_link",
    note: "Signs in with a Google account — save that one under Gmail / Google.",
    fields: [
      { id: "channel_link", label: "Channel link", kind: "url" },
      { id: "channel_id", label: "Channel ID", kind: "text" },
      { id: "owner_email", label: "Owner Google account", kind: "email", linkable: true },
    ],
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    signIn: true,
    primary: "profile_link",
    fields: [{ id: "profile_link", label: "Profile / page link", kind: "url" }, login, password],
  },
  {
    id: "whatsapp_business",
    label: "WhatsApp Business",
    signIn: false,
    primary: "number",
    fields: [
      { id: "number", label: "WhatsApp number", kind: "phone", placeholder: "+92 3xx xxxxxxx" },
      { id: "pin", label: "Two-step PIN", kind: "secret" },
      { id: "pin_email", label: "PIN recovery email", kind: "email", linkable: true },
      { id: "linked_business", label: "Linked Meta business", kind: "text" },
    ],
  },
  {
    id: "website_hosting",
    label: "Website / hosting",
    signIn: true,
    primary: "provider",
    fields: [
      { id: "provider", label: "Hosting provider", kind: "text", placeholder: "Hostinger" },
      { id: "panel_link", label: "Panel login link", kind: "url" },
      { id: "username", label: "Panel username / email", kind: "text", linkable: true },
      { id: "password", label: "Panel password", kind: "secret" },
      { id: "wp_link", label: "WordPress admin link", kind: "url" },
      { id: "wp_username", label: "WordPress username", kind: "text" },
      { id: "wp_password", label: "WordPress password", kind: "secret" },
    ],
  },
  {
    id: "domain",
    label: "Domain",
    signIn: true,
    primary: "domain",
    fields: [
      { id: "domain", label: "Domain", kind: "text", placeholder: "example.com" },
      { id: "registrar", label: "Registrar", kind: "text" },
      { id: "login", label: "Registrar login", kind: "text", linkable: true },
      password,
      { id: "renewal_date", label: "Renews on", kind: "date" },
    ],
  },
  {
    id: "other",
    label: "Other",
    signIn: true,
    primary: "login",
    fields: [
      { id: "service_name", label: "Service name", kind: "text" },
      { id: "link", label: "Login link", kind: "url" },
      { id: "login", label: "Username / email", kind: "text", linkable: true },
      password,
    ],
  },
];

const BY_ID = new Map(PLATFORMS.map((p) => [p.id, p]));
export function getPlatform(id: PlatformId): PlatformDef {
  return BY_ID.get(id) ?? BY_ID.get("other")!;
}

export const TWO_STEP_METHODS = [
  "Google Authenticator",
  "Microsoft Authenticator",
  "Authy",
  "SMS / phone call",
  "Security key",
  "Other",
] as const;

export type TwoStep = {
  enabled: boolean;
  method: string;
  device: string;
  secretKey: string;
  backupCodes: string;
  recoveryEmail: string;
  recoveryPhone: string;
  whatsapp: string;
  securityQa: string;
};

export type CustomField = { label: string; value: string; secret: boolean };

export type PasswordChange = { field: string; value: string; changedAt: string };

/** The decrypted payload of a vault entry. */
export type VaultSecret = {
  v: 2;
  /** Shoaib's own account rather than a client's. */
  own: boolean;
  /** A Gmail that's the main Google account a client/project runs on —
   *  pinned first, linked from other accounts, held to a stricter check. */
  master: boolean;
  title: string;
  platform: PlatformId;
  fields: Record<string, string>;
  /** Linkable field id → the vault entry (a Gmail) it signs in with. The
   *  field itself keeps a copy of that Gmail's address as of the last save. */
  links: Record<string, string>;
  custom: CustomField[];
  twoStep: TwoStep;
  notes: string;
  /** Previous values of secret fields, newest first — kept so a password
   *  change that didn't take on the platform side can be rolled back. */
  passwordHistory: PasswordChange[];
  passwordChangedAt: string | null;
  clientNotifiedAt: string | null;
};

const emptyTwoStep: TwoStep = {
  enabled: false,
  method: "",
  device: "",
  secretKey: "",
  backupCodes: "",
  recoveryEmail: "",
  recoveryPhone: "",
  whatsapp: "",
  securityQa: "",
};

export function emptySecret(platform: PlatformId, own = false): VaultSecret {
  return {
    v: 2,
    own,
    master: false,
    title: "",
    platform,
    fields: {},
    links: {},
    custom: [],
    twoStep: { ...emptyTwoStep },
    notes: "",
    passwordHistory: [],
    passwordChangedAt: null,
    clientNotifiedAt: null,
  };
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Fills any missing keys so older or partial payloads are safe to edit. */
export function normalizeSecret(raw: unknown): VaultSecret {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const base = emptySecret(BY_ID.has(r.platform as PlatformId) ? (r.platform as PlatformId) : "other", r.own === true);
  const fields: Record<string, string> = {};
  if (r.fields && typeof r.fields === "object") {
    for (const [k, v] of Object.entries(r.fields as Record<string, unknown>)) fields[k] = str(v);
  }
  const links: Record<string, string> = {};
  if (r.links && typeof r.links === "object") {
    for (const [k, v] of Object.entries(r.links as Record<string, unknown>)) if (str(v)) links[k] = str(v);
  }
  const t = (r.twoStep && typeof r.twoStep === "object" ? r.twoStep : {}) as Record<string, unknown>;
  return {
    ...base,
    master: base.platform === "google_account" && r.master === true,
    title: str(r.title),
    fields,
    links,
    custom: Array.isArray(r.custom)
      ? r.custom.map((c) => ({ label: str(c?.label), value: str(c?.value), secret: c?.secret === true }))
      : [],
    twoStep: {
      enabled: t.enabled === true,
      method: str(t.method),
      device: str(t.device),
      secretKey: str(t.secretKey),
      backupCodes: str(t.backupCodes),
      recoveryEmail: str(t.recoveryEmail),
      recoveryPhone: str(t.recoveryPhone),
      whatsapp: str(t.whatsapp),
      securityQa: str(t.securityQa),
    },
    notes: str(r.notes),
    passwordHistory: Array.isArray(r.passwordHistory)
      ? r.passwordHistory.map((h) => ({ field: str(h?.field), value: str(h?.value), changedAt: str(h?.changedAt) }))
      : [],
    passwordChangedAt: str(r.passwordChangedAt) || null,
    clientNotifiedAt: str(r.clientNotifiedAt) || null,
  };
}

/** An account a client sent through the portal, made safe to import: only
 *  what they typed survives — never links into the vault, password
 *  history, notification state or "own account" flags. */
export function sanitizeSubmitted(raw: unknown): VaultSecret {
  const secret = normalizeSecret(raw);
  return {
    ...secret,
    own: false,
    links: {},
    passwordHistory: [],
    passwordChangedAt: null,
    clientNotifiedAt: null,
  };
}

/** "Gmail / Google" — or "Master Gmail" for a client's main Google account. */
export function platformLabel(secret: Pick<VaultSecret, "platform" | "master">): string {
  return secret.master ? "Master Gmail" : getPlatform(secret.platform).label;
}

/**
 * What an account is "for" in portal requests and the client's status list:
 * a platform id, or "master_gmail" for a master Gmail (a Gmail entry with
 * the master flag). Stored in plaintext on requests/submissions, so it
 * never includes anything about the account itself.
 */
export type RequestKey = PlatformId | "master_gmail";

export function requestKeyOf(secret: Pick<VaultSecret, "platform" | "master">): RequestKey {
  return secret.master ? "master_gmail" : secret.platform;
}

export function requestKeyLabel(key: string): string {
  if (key === "master_gmail") return "Master Gmail";
  return BY_ID.get(key as PlatformId)?.label ?? "Other";
}

export function isRequestKey(key: string): key is RequestKey {
  return key === "master_gmail" || BY_ID.has(key as PlatformId);
}

/** A blank account card for a request key (master Gmail = Gmail + flag). */
export function secretForRequestKey(key: RequestKey): VaultSecret {
  return key === "master_gmail" ? { ...emptySecret("google_account"), master: true } : emptySecret(key);
}

/** "Toni and Guy — Instagram" — the title an entry gets until it's edited. */
export function defaultTitle(owner: string | null, secret: Pick<VaultSecret, "platform" | "master">): string {
  const label = platformLabel(secret);
  return owner ? `${owner} — ${label}` : label;
}

/** The account's identifying value, for the list (username, link, ID…). */
export function accountLabel(secret: VaultSecret): string {
  const platform = getPlatform(secret.platform);
  const candidates = [platform.primary, "username", "login", "email", ...platform.fields.map((f) => f.id)];
  for (const id of candidates) {
    const field = platform.fields.find((f) => f.id === id);
    const value = secret.fields[id]?.trim();
    if (field && field.kind !== "secret" && value) return value;
  }
  return "";
}

/** The secret fields (passwords, PINs) a platform has. */
export function secretFieldIds(platform: PlatformId): string[] {
  return getPlatform(platform)
    .fields.filter((f) => f.kind === "secret")
    .map((f) => f.id);
}

export type SecurityIssue =
  | "two_step_off"
  | "no_backup_codes"
  | "no_recovery"
  | "no_recovery_email"
  | "no_recovery_phone"
  | "weak_password"
  | "client_not_told";

export const ISSUE_LABELS: Record<SecurityIssue, string> = {
  two_step_off: "2-step off",
  no_backup_codes: "No backup codes",
  no_recovery: "No recovery info",
  no_recovery_email: "No recovery email",
  no_recovery_phone: "No recovery phone",
  weak_password: "Weak password",
  client_not_told: "Client not told",
};

/** What still needs doing to make this account safe. */
export function securityIssues(secret: VaultSecret): SecurityIssue[] {
  const platform = getPlatform(secret.platform);
  const issues: SecurityIssue[] = [];
  if (platform.signIn) {
    const t = secret.twoStep;
    if (!t.enabled) issues.push("two_step_off");
    else if (!t.backupCodes.trim()) issues.push("no_backup_codes");
    if (secret.master) {
      // Other accounts sign in through a master Gmail, so it needs every
      // way back in — both recovery routes, not just one of them.
      if (!t.recoveryEmail.trim()) issues.push("no_recovery_email");
      if (!t.recoveryPhone.trim()) issues.push("no_recovery_phone");
    } else if (!t.recoveryEmail.trim() && !t.recoveryPhone.trim()) {
      issues.push("no_recovery");
    }
  }
  const weak = platform.fields.some(
    (f) => f.kind === "secret" && f.id !== "pin" && secret.fields[f.id] && passwordStrength(secret.fields[f.id]).score < 3
  );
  if (weak) issues.push("weak_password");
  if (
    !secret.own &&
    secret.passwordChangedAt &&
    (!secret.clientNotifiedAt || secret.clientNotifiedAt < secret.passwordChangedAt)
  ) {
    issues.push("client_not_told");
  }
  return issues;
}

/** Records changed secret fields into history before a save. Returns the
 *  updated secret (unchanged if nothing secret was edited). */
export function trackPasswordChanges(before: VaultSecret | null, after: VaultSecret, now: string): VaultSecret {
  if (!before) return after;
  const changes: PasswordChange[] = [];
  for (const id of secretFieldIds(after.platform)) {
    const old = before.fields[id] ?? "";
    if (old && old !== (after.fields[id] ?? "")) changes.push({ field: id, value: old, changedAt: now });
  }
  if (changes.length === 0) return after;
  return {
    ...after,
    passwordHistory: [...changes, ...after.passwordHistory].slice(0, 10),
    passwordChangedAt: now,
  };
}
