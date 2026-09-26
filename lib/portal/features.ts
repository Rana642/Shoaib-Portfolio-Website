/**
 * What the client portal can do, and who gets what. Access flows down:
 *  1. Shoaib turns features on per client (clients.portal_features) — the
 *     client's Owner(s) get exactly those.
 *  2. An Owner with "team" can add team members and give each a subset of
 *     the client's features (never "team" itself), optionally limited to
 *     some projects.
 * A member's effective features are always re-intersected with the
 * client's CURRENT features, so switching a feature off for a client takes
 * it away from the whole team at once.
 */

export const PORTAL_FEATURES = [
  { key: "intakes", label: "Fill intake forms", hint: "Set-up forms I send for their projects." },
  { key: "planner", label: "See the content planner", hint: "Upcoming posts (coming soon)." },
  { key: "uploads", label: "Upload graphics / media", hint: "For posts and campaigns (coming soon)." },
  { key: "approvals", label: "Approve posts", hint: "Approve or comment on planned posts (coming soon)." },
  { key: "credentials", label: "Send accounts / logins", hint: "Send me logins or confirm access, encrypted." },
  { key: "reports", label: "See reports", hint: "Ads and page performance (coming soon)." },
  { key: "team", label: "Add team members", hint: "The Owner can invite people and give them some of these." },
] as const;

export type PortalFeature = (typeof PORTAL_FEATURES)[number]["key"];

export const FEATURE_KEYS = PORTAL_FEATURES.map((f) => f.key) as PortalFeature[];

/** Features an Owner can pass on to a team member — everything but "team". */
export const DELEGABLE: PortalFeature[] = FEATURE_KEYS.filter((k) => k !== "team");

/** Features clients get unless Shoaib changes them. */
export const DEFAULT_CLIENT_FEATURES: PortalFeature[] = ["intakes", "credentials"];

export type PortalRole = "owner" | "member";

export function isFeature(key: string): key is PortalFeature {
  return (FEATURE_KEYS as string[]).includes(key);
}

export function featureLabel(key: string): string {
  return PORTAL_FEATURES.find((f) => f.key === key)?.label ?? key;
}

/** What someone can actually do right now. */
export function effectiveFeatures(role: PortalRole, clientFeatures: string[], memberPermissions: string[]): PortalFeature[] {
  const client = clientFeatures.filter(isFeature);
  if (role === "owner") return client;
  return client.filter((f) => f !== "team" && memberPermissions.includes(f));
}
