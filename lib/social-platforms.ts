/**
 * Single source of truth for which platforms the Connections hub shows and
 * how each one connects. Client-safe (no server-only imports) so the UI can
 * render tiles/matrix columns straight from it. Adding a platform for the
 * future SaaS = one entry here + its connect route; the hub renders it.
 *
 * connect modes:
 *  - "account_import": one admin login discovers many Pages/orgs, which are
 *    then imported into projects (Facebook→FB+IG, LinkedIn).
 *  - "project_oauth": an OAuth round trip per project (TikTok).
 *  - "workspace": runs on a workspace-level credential that already covers
 *    every project (Meta Ads via the vault's System User); the connect link
 *    re-verifies access through Facebook Login for Business.
 */
export type PlatformKey = "facebook" | "instagram" | "meta_ads" | "linkedin" | "tiktok";

export type PlatformDef = {
  key: PlatformKey;
  label: string;
  tagline: string;
  mode: "account_import" | "project_oauth" | "workspace";
  /** Which workspace login discovers this platform (account_import only). */
  loginProvider?: "facebook" | "linkedin";
  /** Per-project connect URL (project_oauth / workspace). */
  connectHref?: (projectId: string) => string;
  /** Tailwind classes for the icon chip. Brand colors are decorative only. */
  chipClass: string;
};

export const PLATFORMS: PlatformDef[] = [
  {
    key: "facebook",
    label: "Facebook",
    tagline: "Page posts & insights",
    mode: "account_import",
    loginProvider: "facebook",
    chipClass: "bg-[#1877F2] text-white",
  },
  {
    key: "instagram",
    label: "Instagram",
    tagline: "Business account posting",
    mode: "account_import",
    loginProvider: "facebook",
    chipClass: "bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white",
  },
  {
    key: "meta_ads",
    label: "Meta Ads",
    tagline: "Campaigns via Marketing API",
    mode: "workspace",
    connectHref: (projectId) => `/api/dashboard/ads/facebook-login/authorize?project_id=${projectId}`,
    chipClass: "bg-[#0866FF] text-white",
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    tagline: "Company Page posting",
    mode: "account_import",
    loginProvider: "linkedin",
    chipClass: "bg-[#0A66C2] text-white",
  },
  {
    key: "tiktok",
    label: "TikTok",
    tagline: "Photo posts to creator inbox",
    mode: "project_oauth",
    connectHref: (projectId) => `/api/dashboard/social/tiktok/authorize?project_id=${projectId}`,
    chipClass: "bg-ink text-white",
  },
];

export type WorkspaceLogin = {
  provider: "facebook" | "linkedin";
  connectedAt: string | null;
  expiresAt: string | null;
  /** e.g. LinkedIn waiting on Community Management API approval. */
  pendingApproval?: boolean;
  /** Computed server-side (render must stay pure) — token expires within 14 days. */
  expiresSoon?: boolean;
};

export type ConnectionStatus = "connected" | "not_connected" | "pending" | "workspace";
