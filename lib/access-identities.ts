/**
 * Shoaib's own accounts that clients grant access TO — his Google account,
 * Google Ads manager (MCC), Meta Business portfolio and so on. Stored once
 * in Settings (settings.access_identities); the vault prefills them on
 * access grants, and the client portal uses them to write each platform's
 * "how to give me access" steps. None of it is secret: it's exactly what
 * a client needs to type in to add him.
 */

export type IdentityKey =
  | "google_email"
  | "mcc_id"
  | "meta_bm_id"
  | "meta_email"
  | "linkedin"
  | "tiktok_bc_id"
  | "hosting_email";

export type AccessIdentities = Partial<Record<IdentityKey, string>>;

export const IDENTITIES: { key: IdentityKey; label: string; placeholder: string; hint: string }[] = [
  {
    key: "google_email",
    label: "Google account",
    placeholder: "you@gmail.com",
    hint: "Invited to Business Profile, Analytics, Tag Manager, Search Console, YouTube and Google Ads.",
  },
  {
    key: "mcc_id",
    label: "Google Ads manager (MCC) ID",
    placeholder: "123-456-7890",
    hint: "Client ad accounts get linked to this manager account.",
  },
  {
    key: "meta_bm_id",
    label: "Meta Business portfolio ID",
    placeholder: "1234567890123456",
    hint: "Clients add it as a partner to share Pages, Instagram, ad accounts and pixels.",
  },
  {
    key: "meta_email",
    label: "Facebook login email",
    placeholder: "you@gmail.com",
    hint: "For Facebook Page access and Business portfolio invites.",
  },
  {
    key: "linkedin",
    label: "LinkedIn profile",
    placeholder: "linkedin.com/in/…",
    hint: "Added as an admin on company Pages.",
  },
  {
    key: "tiktok_bc_id",
    label: "TikTok Business Center ID",
    placeholder: "7…",
    hint: "Clients share their TikTok account and ad account with it.",
  },
  {
    key: "hosting_email",
    label: "Hosting account email",
    placeholder: "you@gmail.com",
    hint: "For Hostinger (or similar) account sharing.",
  },
];

export const IDENTITY_KEYS = IDENTITIES.map((i) => i.key);

export function identityLabel(key: string): string {
  return IDENTITIES.find((i) => i.key === key)?.label ?? "Someone else";
}

export function normalizeIdentities(raw: unknown): AccessIdentities {
  const out: AccessIdentities = {};
  if (raw && typeof raw === "object") {
    for (const key of IDENTITY_KEYS) {
      const v = (raw as Record<string, unknown>)[key];
      if (typeof v === "string" && v.trim()) out[key] = v.trim();
    }
  }
  return out;
}
