/**
 * What a password-vault entry looks like, per platform. Each platform
 * lists its own fields, whether a login applies to it, and how a client can
 * GRANT access instead (or as well): a Facebook Page has no password — the
 * client gives Shoaib's profile or Business portfolio access; Instagram
 * works through Meta Business for posting and ads, but its bio and username
 * still need the login; Google Analytics is only ever access.
 *
 * So an entry holds a login, an access grant, or both, and the form renders
 * whatever the chosen platform supports. This file only describes the SHAPE
 * of an entry; the values exist decrypted in the browser alone
 * (lib/vault-crypto.ts). Platform facts are from each platform's own help
 * centre (2026-09).
 */

import { passwordStrength } from "./password-generator";
import type { AccessIdentities, IdentityKey } from "./access-identities";

export type FieldKind = "text" | "email" | "phone" | "url" | "secret" | "multiline" | "date";

export type FieldDef = {
  id: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  /** Takes a sign-in email — can be linked to a Gmail saved in the vault. */
  linkable?: boolean;
  /** Part of the login (credentials) — only shown when a login is held. */
  login?: boolean;
};

export type PlatformId =
  | "google_account"
  | "facebook_profile"
  | "facebook_page"
  | "instagram"
  | "meta_business"
  | "whatsapp_business"
  | "google_business"
  | "google_ads"
  | "google_analytics"
  | "google_tag_manager"
  | "search_console"
  | "youtube"
  | "tiktok"
  | "linkedin"
  | "linkedin_page"
  | "website_hosting"
  | "domain"
  | "other";

/** How much a login matters for a platform:
 *  required — it's the only way in (Gmail, a personal profile);
 *  recommended — access covers part of the work, the rest needs the login
 *    (Instagram's bio/username, TikTok profile edits);
 *  optional — access is normal, a login is sometimes handed over;
 *  none — there's no login to hold (a Facebook Page, GA4). */
export type LoginNeed = "required" | "recommended" | "optional" | "none";

/** One way a client can give Shoaib access. `steps` are shown to the
 *  client in the portal; {value} becomes his identity (e.g. his Gmail). */
export type AccessRoute = {
  via: IdentityKey | "custom";
  label: string;
  roles: string[];
  steps: string[];
};

export type PlatformDef = {
  id: PlatformId;
  label: string;
  fields: FieldDef[];
  /** A login with its own 2-step verification & recovery. */
  signIn: boolean;
  /** The field that identifies the account in the list. */
  primary: string;
  login: LoginNeed;
  access?: AccessRoute[];
  /** What a new card starts with. */
  starts: "login" | "access";
  /** What access covers, and when the login is needed too. */
  guidance?: string;
};

const email = (id: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({
  id,
  label,
  kind: "email",
  placeholder: "name@gmail.com",
  linkable: true,
  ...extra,
});
const login: FieldDef = { id: "login", label: "Login email or phone", kind: "text", placeholder: "name@gmail.com", linkable: true, login: true };
const password: FieldDef = { id: "password", label: "Password", kind: "secret", login: true };

const partnerSteps = (asset: string) => [
  "Open Meta Business Suite → Settings → Partners.",
  "Click Add → “Give a partner access to your assets”, and enter the Business ID {value}.",
  `Select ${asset}, turn on Full control, and confirm.`,
];
const googleUserSteps = (where: string, role: string) => [
  `${where}.`,
  "Add a user with the email {value}.",
  `Choose ${role}, and send the invite.`,
];

export const PLATFORMS: PlatformDef[] = [
  {
    id: "google_account",
    label: "Gmail / Google",
    signIn: true,
    primary: "email",
    login: "required",
    starts: "login",
    fields: [email("email", "Google email", { linkable: false }), password],
  },
  {
    id: "facebook_profile",
    label: "Facebook profile",
    signIn: true,
    primary: "profile_link",
    login: "required",
    starts: "login",
    guidance: "A personal profile can't be shared — it's a login. It's usually the profile that owns the Page and Business portfolio.",
    fields: [{ id: "profile_link", label: "Profile link", kind: "url", placeholder: "facebook.com/…" }, login, password],
  },
  {
    id: "facebook_page",
    label: "Facebook page",
    signIn: false,
    primary: "page_link",
    login: "none",
    starts: "access",
    guidance: "Pages have no password. “Facebook access” with full control covers every setting, posting, messages and ads.",
    fields: [
      { id: "page_link", label: "Page link", kind: "url", placeholder: "facebook.com/…" },
      { id: "page_id", label: "Page ID", kind: "text" },
    ],
    access: [
      {
        via: "meta_email",
        label: "Facebook access to my profile",
        roles: ["Full control", "Task access"],
        steps: [
          "Open your Facebook Page → Settings → Page setup → Page access.",
          "Next to “People with Facebook access”, click Add New.",
          "Search for {value}, turn on Full control, and click Give access.",
        ],
      },
      {
        via: "meta_bm_id",
        label: "Partner access to my Business portfolio",
        roles: ["Full control", "Partial access"],
        steps: partnerSteps("your Page"),
      },
    ],
  },
  {
    id: "instagram",
    label: "Instagram",
    signIn: true,
    primary: "username",
    login: "recommended",
    starts: "login",
    guidance:
      "Meta Business access covers posting, messages, ads and insights. Changing the bio, username, profile photo or highlights needs the login.",
    fields: [
      { id: "username", label: "Username", kind: "text", placeholder: "@handle" },
      login,
      password,
      { id: "linked_page", label: "Linked Facebook page", kind: "text" },
    ],
    access: [
      {
        via: "meta_bm_id",
        label: "Partner access to my Business portfolio",
        roles: ["Full control", "Partial access"],
        steps: partnerSteps("your Instagram account"),
      },
    ],
  },
  {
    id: "meta_business",
    label: "Meta Business",
    signIn: false,
    primary: "business_id",
    login: "none",
    starts: "access",
    guidance:
      "Opened through a Facebook profile — no login of its own. Partner access shares Pages, Instagram, ad accounts and the pixel; for a brand-new business I create it.",
    fields: [
      { id: "business_id", label: "Business portfolio ID", kind: "text" },
      { id: "dataset_id", label: "Pixel / dataset ID", kind: "text" },
      { id: "ad_accounts", label: "Ad account ID(s)", kind: "multiline" },
    ],
    access: [
      {
        via: "meta_bm_id",
        label: "Partner access to my Business portfolio",
        roles: ["Full control", "Partial access"],
        steps: partnerSteps("your Pages, ad accounts, pixel/dataset and Instagram account"),
      },
      {
        via: "meta_email",
        label: "Admin in their portfolio",
        roles: ["Full control (admin)", "Partial access (employee)"],
        steps: [
          "Open Meta Business Suite → Settings → People.",
          "Click Invite people and enter {value}.",
          "Give Full control and send the invite.",
        ],
      },
    ],
  },
  {
    id: "whatsapp_business",
    label: "WhatsApp Business",
    signIn: false,
    primary: "number",
    login: "required",
    starts: "login",
    guidance: "The Business app lives on one phone — keep the number, its two-step PIN and the PIN recovery email.",
    fields: [
      { id: "number", label: "WhatsApp number", kind: "phone", placeholder: "+92 3xx xxxxxxx" },
      { id: "pin", label: "Two-step PIN", kind: "secret", login: true },
      email("pin_email", "PIN recovery email", { login: true }),
      { id: "linked_business", label: "Linked Meta business", kind: "text" },
    ],
  },
  {
    id: "google_business",
    label: "Google Business Profile",
    signIn: false,
    primary: "profile_link",
    login: "optional",
    starts: "access",
    guidance:
      "Invite by email as Manager or Owner. New owners and managers wait 7 days for some features. If the client's master Gmail owns it, that login covers it too.",
    fields: [
      { id: "profile_link", label: "Business Profile link", kind: "url" },
      email("owner_email", "Primary owner Gmail"),
    ],
    access: [
      {
        via: "google_email",
        label: "My Google account",
        roles: ["Manager", "Owner"],
        steps: [
          "Search your business name on Google while signed in, and open your Business Profile.",
          "Go to ⋮ Menu → Business Profile settings → People and access.",
          "Click Add, enter {value}, choose Manager (or Owner), and send the invite.",
        ],
      },
    ],
  },
  {
    id: "google_ads",
    label: "Google Ads",
    signIn: false,
    primary: "customer_id",
    login: "optional",
    starts: "access",
    guidance:
      "Linking to my manager account is the norm: I send a link request to the 10-digit customer ID and the client's admin accepts it. A login only comes through the Gmail that owns it.",
    fields: [
      { id: "customer_id", label: "Customer ID", kind: "text", placeholder: "123-456-7890" },
      email("login_email", "Sign-in Google account", { login: true }),
    ],
    access: [
      {
        via: "mcc_id",
        label: "Linked to my manager (MCC) account",
        roles: ["Linked (manager)", "Linked (owner)"],
        steps: [
          "Send me your 10-digit Google Ads customer ID (top right of Google Ads).",
          "I'll send a link request from my manager account ({value}).",
          "Accept it in Google Ads → Admin → Access and security → Managers.",
        ],
      },
      {
        via: "google_email",
        label: "User on their account",
        roles: ["Admin", "Standard", "Read only"],
        steps: googleUserSteps("In Google Ads, open Admin → Access and security → Users, and click +", "Admin"),
      },
    ],
  },
  {
    id: "google_analytics",
    label: "Google Analytics (GA4)",
    signIn: false,
    primary: "ga4_property",
    login: "none",
    starts: "access",
    fields: [{ id: "ga4_property", label: "GA4 property ID", kind: "text" }],
    access: [
      {
        via: "google_email",
        label: "My Google account",
        roles: ["Administrator", "Editor", "Marketer", "Analyst", "Viewer"],
        steps: googleUserSteps("In Google Analytics, open Admin → Property access management, and click +", "Administrator (or Editor)"),
      },
    ],
  },
  {
    id: "google_tag_manager",
    label: "Google Tag Manager",
    signIn: false,
    primary: "gtm_container",
    login: "none",
    starts: "access",
    fields: [{ id: "gtm_container", label: "Container ID", kind: "text", placeholder: "GTM-XXXXXXX" }],
    access: [
      {
        via: "google_email",
        label: "My Google account",
        roles: ["Publish", "Approve", "Edit", "Read"],
        steps: googleUserSteps(
          "In Tag Manager, open Admin → User Management (account), and click +",
          "Publish on the container (and Admin on the account)"
        ),
      },
    ],
  },
  {
    id: "search_console",
    label: "Search Console",
    signIn: false,
    primary: "property",
    login: "none",
    starts: "access",
    guidance: "“Restricted” can only look — choose Full (or Owner) so fixes can be made.",
    fields: [{ id: "property", label: "Property (site)", kind: "url" }],
    access: [
      {
        via: "google_email",
        label: "My Google account",
        roles: ["Full", "Owner", "Restricted"],
        steps: googleUserSteps("In Search Console, open Settings → Users and permissions, and click Add user", "Full (or Owner)"),
      },
    ],
  },
  {
    id: "youtube",
    label: "YouTube",
    signIn: false,
    primary: "channel_link",
    login: "optional",
    starts: "access",
    guidance:
      "Channel permissions (Manager / Editor) cover uploads and YouTube Studio. The channel name, handle and ownership stay with the owner — through the master Gmail if it owns it.",
    fields: [
      { id: "channel_link", label: "Channel link", kind: "url" },
      { id: "channel_id", label: "Channel ID", kind: "text" },
      email("owner_email", "Owner Google account"),
    ],
    access: [
      {
        via: "google_email",
        label: "My Google account",
        roles: ["Manager", "Editor", "Owner (Brand Account)"],
        steps: [
          "Open YouTube Studio → Settings → Permissions.",
          "Click Invite, enter {value}, and choose Manager.",
          "Click Done, then Save.",
        ],
      },
    ],
  },
  {
    id: "tiktok",
    label: "TikTok",
    signIn: true,
    primary: "username",
    login: "recommended",
    starts: "login",
    guidance: "Business Center sharing covers ads and some account management. Profile edits and posting from the app need the login.",
    fields: [
      { id: "username", label: "Username", kind: "text", placeholder: "@handle" },
      login,
      password,
      { id: "ad_account_id", label: "Ad account ID", kind: "text" },
    ],
    access: [
      {
        via: "tiktok_bc_id",
        label: "Partner in my Business Center",
        roles: ["Admin", "Operator", "Analyst"],
        steps: [
          "In TikTok Business Center, open Users → Partners.",
          "Click Add partner and enter the Business Center ID {value}.",
          "Share your TikTok account and ad account with Admin permission.",
        ],
      },
    ],
  },
  {
    id: "linkedin",
    label: "LinkedIn profile",
    signIn: true,
    primary: "profile_link",
    login: "required",
    starts: "login",
    guidance: "A personal profile can only be optimised with its login — admin access is for company Pages.",
    fields: [{ id: "profile_link", label: "Profile link", kind: "url" }, login, password],
  },
  {
    id: "linkedin_page",
    label: "LinkedIn page",
    signIn: false,
    primary: "page_link",
    login: "none",
    starts: "access",
    guidance: "Super admin covers everything, including page details and other admins.",
    fields: [{ id: "page_link", label: "Page link", kind: "url" }],
    access: [
      {
        via: "linkedin",
        label: "Admin through my LinkedIn profile",
        roles: ["Super admin", "Content admin", "Analyst"],
        steps: [
          "Open your LinkedIn Page as an admin → Settings → Manage admins.",
          "Click Add admin and search for my profile ({value}).",
          "Choose Super admin and save.",
        ],
      },
    ],
  },
  {
    id: "website_hosting",
    label: "Website / hosting",
    signIn: true,
    primary: "provider",
    login: "optional",
    starts: "login",
    fields: [
      { id: "provider", label: "Hosting provider", kind: "text", placeholder: "Hostinger" },
      { id: "site", label: "Website", kind: "url" },
      { id: "panel_link", label: "Panel login link", kind: "url", login: true },
      { id: "username", label: "Panel username / email", kind: "text", linkable: true, login: true },
      { id: "password", label: "Panel password", kind: "secret", login: true },
      { id: "wp_link", label: "WordPress admin link", kind: "url", login: true },
      { id: "wp_username", label: "WordPress username", kind: "text", login: true },
      { id: "wp_password", label: "WordPress password", kind: "secret", login: true },
    ],
    access: [
      {
        via: "hosting_email",
        label: "Shared with my hosting account",
        roles: ["Admin", "Collaborator"],
        steps: [
          "In Hostinger, open your profile → Account sharing.",
          "Click Grant access and enter {value}.",
          "Choose Admin (or Collaborator) and confirm.",
        ],
      },
    ],
  },
  {
    id: "domain",
    label: "Domain",
    signIn: true,
    primary: "domain",
    login: "required",
    starts: "login",
    fields: [
      { id: "domain", label: "Domain", kind: "text", placeholder: "example.com" },
      { id: "registrar", label: "Registrar", kind: "text" },
      { id: "login", label: "Registrar login", kind: "text", linkable: true, login: true },
      password,
      { id: "renewal_date", label: "Renews on", kind: "date" },
    ],
  },
  {
    id: "other",
    label: "Other",
    signIn: true,
    primary: "service_name",
    login: "optional",
    starts: "login",
    fields: [
      { id: "service_name", label: "Service name", kind: "text" },
      { id: "link", label: "Link", kind: "url" },
      { id: "login", label: "Username / email", kind: "text", linkable: true, login: true },
      password,
    ],
    access: [
      {
        via: "custom",
        label: "Admin / team access",
        roles: ["Admin", "Editor", "Viewer"],
        steps: ["Add me as an admin in the service's team or user settings (ask me which email to use)."],
      },
    ],
  },
];

const BY_ID = new Map(PLATFORMS.map((p) => [p.id, p]));
export function getPlatform(id: PlatformId): PlatformDef {
  return BY_ID.get(id) ?? BY_ID.get("other")!;
}

// Fields that older versions of a platform had — shown as custom fields
// (never dropped) when an old entry is opened.
const LEGACY_LABELS: Record<string, string> = {
  admin_profiles: "Admin profile(s)",
  admins: "Admins / partners",
  manager_id: "Manager (MCC) ID",
  gtm_container: "GTM container ID",
  search_console: "Search Console property",
  access_email: "Access given to",
  managers: "Managers",
  business_center_id: "Business Center ID",
};

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

export type AccessStatus = "requested" | "client_added" | "verified";

export const ACCESS_STATUS_LABELS: Record<AccessStatus, string> = {
  requested: "Requested",
  client_added: "Client says it's added",
  verified: "Verified by me",
};

/** Access the client granted to one of Shoaib's identities. */
export type AccessGrant = {
  enabled: boolean;
  via: IdentityKey | "custom";
  /** The identity as it was when granted (his Gmail, MCC ID…) — a record
   *  of exactly what to remove at handover, even if Settings change. */
  grantedTo: string;
  role: string;
  status: AccessStatus;
  verifiedAt: string | null;
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
  /** Whether the login (credentials) is held for this account. */
  loginHeld: boolean;
  access: AccessGrant;
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

/** A platform's first access route, set up but not yet enabled/granted. */
function defaultAccess(platform: PlatformDef, enabled: boolean): AccessGrant {
  const route = platform.access?.[0];
  return {
    enabled: enabled && Boolean(route),
    via: route?.via ?? "custom",
    grantedTo: "",
    role: route?.roles[0] ?? "",
    status: "requested",
    verifiedAt: null,
  };
}

export function emptySecret(platformId: PlatformId, own = false): VaultSecret {
  const platform = getPlatform(platformId);
  return {
    v: 2,
    own,
    master: false,
    title: "",
    platform: platform.id,
    fields: {},
    links: {},
    loginHeld: platform.login !== "none" && platform.starts === "login",
    access: defaultAccess(platform, platform.starts === "access"),
    custom: [],
    twoStep: { ...emptyTwoStep },
    notes: "",
    passwordHistory: [],
    passwordChangedAt: null,
    clientNotifiedAt: null,
  };
}

/** The same account on a different platform: shared field values carry
 *  over, login/access reset to the new platform's defaults. */
export function switchPlatform(secret: VaultSecret, platformId: PlatformId, master = false): VaultSecret {
  const fresh = emptySecret(platformId, secret.own);
  return { ...secret, platform: fresh.platform, master: fresh.platform === "google_account" && master, loginHeld: fresh.loginHeld, access: fresh.access };
}

/** Fills an access grant's "given to" from Settings when it's still empty. */
export function withIdentity(secret: VaultSecret, identities: AccessIdentities): VaultSecret {
  const { access } = secret;
  if (!access.enabled || access.grantedTo || access.via === "custom") return secret;
  const value = identities[access.via];
  return value ? { ...secret, access: { ...access, grantedTo: value } } : secret;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const humanize = (key: string) => key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Fills any missing keys so older or partial payloads are safe to edit. */
export function normalizeSecret(raw: unknown): VaultSecret {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const base = emptySecret(BY_ID.has(r.platform as PlatformId) ? (r.platform as PlatformId) : "other", r.own === true);
  const platform = getPlatform(base.platform);

  // Values of fields this platform no longer has move to custom fields —
  // an older entry never loses anything.
  const known = new Set(platform.fields.map((f) => f.id));
  const fields: Record<string, string> = {};
  const moved: CustomField[] = [];
  if (r.fields && typeof r.fields === "object") {
    for (const [k, v] of Object.entries(r.fields as Record<string, unknown>)) {
      const value = str(v);
      if (known.has(k)) fields[k] = value;
      else if (value.trim()) moved.push({ label: LEGACY_LABELS[k] ?? humanize(k), value, secret: false });
    }
  }
  const links: Record<string, string> = {};
  if (r.links && typeof r.links === "object") {
    for (const [k, v] of Object.entries(r.links as Record<string, unknown>)) if (known.has(k) && str(v)) links[k] = str(v);
  }
  const t = (r.twoStep && typeof r.twoStep === "object" ? r.twoStep : {}) as Record<string, unknown>;

  // Entries from before login/access existed: a login-less platform was
  // always an access grant (status unknown → "client says it's added").
  const a = r.access && typeof r.access === "object" ? (r.access as Record<string, unknown>) : null;
  const routeVias = (platform.access ?? []).map((route) => route.via as string);
  const access: AccessGrant = a
    ? {
        enabled: a.enabled === true && routeVias.length > 0,
        via: (routeVias.includes(str(a.via)) ? str(a.via) : (routeVias[0] ?? "custom")) as AccessGrant["via"],
        grantedTo: str(a.grantedTo),
        role: str(a.role),
        status: (["requested", "client_added", "verified"].includes(str(a.status)) ? str(a.status) : "requested") as AccessStatus,
        verifiedAt: str(a.verifiedAt) || null,
      }
    : { ...defaultAccess(platform, platform.login === "none"), status: "client_added" };

  return {
    ...base,
    master: base.platform === "google_account" && r.master === true,
    title: str(r.title),
    fields,
    links,
    loginHeld: platform.login === "none" ? false : typeof r.loginHeld === "boolean" ? r.loginHeld : true,
    access,
    custom: [
      ...(Array.isArray(r.custom)
        ? r.custom.map((c) => ({ label: str(c?.label), value: str(c?.value), secret: c?.secret === true }))
        : []),
      ...moved,
    ],
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
 *  history, notification state, "own account" flags, or a "verified"
 *  access status (only Shoaib verifies). */
export function sanitizeSubmitted(raw: unknown): VaultSecret {
  const secret = normalizeSecret(raw);
  return {
    ...secret,
    own: false,
    links: {},
    access: {
      ...secret.access,
      status: secret.access.status === "verified" ? "client_added" : secret.access.status,
      verifiedAt: null,
    },
    passwordHistory: [],
    passwordChangedAt: null,
    clientNotifiedAt: null,
  };
}

/** "Gmail / Google" — or "Master Gmail" for a client's main Google account. */
export function platformLabel(secret: Pick<VaultSecret, "platform" | "master">): string {
  return secret.master ? "Master Gmail" : getPlatform(secret.platform).label;
}

/** "Login", "Access", "Login + access" — what's held for an account. */
export function holdingLabel(secret: Pick<VaultSecret, "loginHeld" | "access">): string {
  if (secret.loginHeld && secret.access.enabled) return "Login + access";
  if (secret.loginHeld) return "Login";
  if (secret.access.enabled) return secret.access.role ? `Access · ${secret.access.role}` : "Access";
  return "Nothing yet";
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
  // Requests from before the GA4 / Tag Manager / Search Console split.
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
    if (field && field.kind !== "secret" && (secret.loginHeld || !field.login) && value) return value;
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
  | "nothing_held"
  | "login_missing"
  | "access_unverified"
  | "two_step_off"
  | "no_backup_codes"
  | "no_recovery"
  | "no_recovery_email"
  | "no_recovery_phone"
  | "weak_password"
  | "client_not_told";

export const ISSUE_LABELS: Record<SecurityIssue, string> = {
  nothing_held: "Nothing saved yet",
  login_missing: "Login needed",
  access_unverified: "Access not verified",
  two_step_off: "2-step off",
  no_backup_codes: "No backup codes",
  no_recovery: "No recovery info",
  no_recovery_email: "No recovery email",
  no_recovery_phone: "No recovery phone",
  weak_password: "Weak password",
  client_not_told: "Client not told",
};

/** What still needs doing to make this account safe and complete. */
export function securityIssues(secret: VaultSecret): SecurityIssue[] {
  const platform = getPlatform(secret.platform);
  const issues: SecurityIssue[] = [];

  if (!secret.loginHeld && !secret.access.enabled) return ["nothing_held"];
  if (!secret.loginHeld && (platform.login === "required" || platform.login === "recommended")) issues.push("login_missing");
  if (secret.access.enabled && secret.access.status !== "verified") issues.push("access_unverified");

  if (secret.loginHeld) {
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
  }

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
