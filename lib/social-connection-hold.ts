import "server-only";
import { db } from "./dashboard/db";
import { resend, isResendConfigured, fromEmail, toEmail } from "./resend";
import { siteUrl } from "./seo";
import type { ClientSocialAccount } from "./dashboard/types";
import type { PlatformPostResult } from "./social-post";

/**
 * When Meta blocks the login behind our Page tokens — a security checkpoint
 * on the Facebook profile ("log in to www.facebook.com and follow the
 * instructions"), a changed password, an expired or revoked token — every
 * live call fails the same way until someone logs in and reconnects. Seen
 * 24–26 Oct 2026: 48 posts and Stories were marked failed and lost.
 *
 * Now such a post is HELD instead: it stays 'scheduled', what already went
 * out (Google, Instagram-login accounts, native Facebook) is kept so it
 * isn't posted twice, and the blocked accounts are tried again later. Shoaib
 * gets one email (repeated at most every ALERT_EVERY_MS) and a banner on the
 * dashboard. Reconnecting Facebook releases every held post at once.
 */

/** A held post is tried again after this long (one probe; the rest wait). */
export const HOLD_RETRY_MS = 60 * 60_000;
/** Stories are only worth posting on the day: give up after this. */
export const STORY_HOLD_LIMIT_MS = 12 * 3600_000;
/** Posts, Reels and videos keep waiting this long, then fail as before. */
export const POST_HOLD_LIMIT_MS = 48 * 3600_000;
const ALERT_EVERY_MS = 6 * 3600_000;

export type HoldInfo = {
  /** When the post was first held. */
  since: string;
  error: string;
  /** Labels of the accounts that were blocked. */
  accounts: string[];
  next_try: string;
  tries: number;
  /** Set on the post whose hold triggered the email. */
  alerted_at?: string;
  /** "rate_limited": only a platform's API limit (e.g. LinkedIn's daily
   *  quota) — retried quietly, no banner or email. Missing = blocked login. */
  kind?: "blocked" | "rate_limited";
};

const CONNECTION_ERROR =
  /log in to www\.facebook\.com|error validating access token|invalid oauth access token|session has been invalidated|session has expired|has not authorized application|user is not a confirmed user/i;
const RATE_LIMIT_ERROR = /HTTP 429|TOO_MANY_REQUESTS|throttle .*limit/i;

/** True when the error means the login/token is blocked — not a problem with the post itself. */
export function isConnectionError(result: PlatformPostResult): boolean {
  return !result.ok && CONNECTION_ERROR.test(result.error ?? "");
}

/** True when the platform refused only because an API limit was reached
 *  (LinkedIn's Development Tier has small daily quotas per resource). */
export function isRateLimited(result: PlatformPostResult): boolean {
  return !result.ok && RATE_LIMIT_ERROR.test(result.error ?? "");
}

/** Worth trying again later rather than failing the post. */
export function isRetryable(result: PlatformPostResult): boolean {
  return isConnectionError(result) || isRateLimited(result);
}

export function holdLimitMs(postType: string | null | undefined): number {
  return postType === "story" ? STORY_HOLD_LIMIT_MS : POST_HOLD_LIMIT_MS;
}

/** A held post whose next try hasn't come yet. */
export function isWaitingToRetry(result: unknown, now = Date.now()): boolean {
  const held = (result as { held?: HoldInfo } | null)?.held;
  return Boolean(held && new Date(held.next_try).getTime() > now);
}

/** The held posts behind one login, so the alert names the profile to fix
 *  instead of "a Facebook connection". */
export type BlockedLogin = {
  /** "facebook": a Facebook profile behind Page tokens; "instagram": an
   *  account connected through Instagram Login. */
  kind: "facebook" | "instagram";
  /** The Facebook profile name, or the Instagram Login account. Null: not
   *  known yet — the accounts weren't refreshed since this was recorded. */
  name: string | null;
  count: number;
  since: string;
  /** e.g. { project: "Hotel Avalon Suites", platforms: ["Facebook", "Instagram"] } */
  accounts: { project: string; platforms: string[] }[];
};

export type HeldSummary = {
  count: number;
  error: string | null;
  logins: BlockedLogin[];
};

/** Every held post right now, grouped by the login that blocks it — for the
 *  dashboard banner and the email. */
export async function heldPostsSummary(): Promise<HeldSummary> {
  const { data } = await db
    .from("scheduled_posts")
    .select("project_id, result, client_projects(name)")
    .eq("status", "scheduled")
    .not("result->held", "is", null);
  // Posts waiting only on an API limit clear by themselves — not an alarm.
  const rows = (
    (data ?? []) as unknown as { project_id: string; result: { held: HoldInfo }; client_projects: { name: string } | null }[]
  ).filter((r) => r.result.held.kind !== "rate_limited");
  if (!rows.length) return { count: 0, error: null, logins: [] };

  // "*" rather than a column list: fb_login_name may not be migrated yet.
  const { data: accountRows } = await db
    .from("client_social_accounts")
    .select("*")
    .in("project_id", [...new Set(rows.map((r) => r.project_id))]);
  const accounts = (accountRows ?? []) as ClientSocialAccount[];

  const groups = new Map<string, { login: Omit<BlockedLogin, "count" | "accounts">; posts: Set<number>; projects: Map<string, Set<string>> }>();
  rows.forEach((row, i) => {
    const { held } = row.result;
    for (const label of held.accounts) {
      const account = accounts.find((a) => a.project_id === row.project_id && a.label === label);
      const viaInstagramLogin = account?.platform === "instagram" && account.token_expires_at !== null;
      const login = viaInstagramLogin
        ? { kind: "instagram" as const, name: label }
        : { kind: "facebook" as const, name: account?.fb_login_name ?? null };
      const key = `${login.kind}:${login.name ?? ""}`;
      const group = groups.get(key) ?? { login: { ...login, since: held.since }, posts: new Set<number>(), projects: new Map() };
      if (held.since < group.login.since) group.login.since = held.since;
      group.posts.add(i);
      const project = row.client_projects?.name ?? "Unknown project";
      const platform = account?.platform === "facebook" ? "Facebook" : account?.platform === "instagram" ? "Instagram" : label;
      group.projects.set(project, (group.projects.get(project) ?? new Set<string>()).add(platform));
      groups.set(key, group);
    }
  });

  const latest = [...rows].sort((a, b) => b.result.held.next_try.localeCompare(a.result.held.next_try))[0];
  return {
    count: rows.length,
    error: latest.result.held.error,
    logins: [...groups.values()]
      .map((g) => ({
        ...g.login,
        count: g.posts.size,
        accounts: [...g.projects]
          .map(([project, platforms]) => ({ project, platforms: [...platforms].sort() }))
          .sort((a, b) => a.project.localeCompare(b.project)),
      }))
      .sort((a, b) => b.count - a.count),
  };
}

/** "Ijaz Danish's Facebook profile", "the Instagram login @x", … */
export function blockedLoginTitle(login: BlockedLogin): string {
  if (login.kind === "instagram") return `The Instagram login ${login.name}`;
  return login.name ? `${login.name}'s Facebook profile` : "A Facebook profile (name not recorded yet)";
}

/** What to do about it, naming the profile to log in with. */
export function blockedLoginFix(login: BlockedLogin): string {
  if (login.kind === "instagram") return `Reconnect ${login.name} with Instagram on the Social page.`;
  const who = login.name ? `as ${login.name}` : "with the profile that connected these Pages";
  return `Log in at facebook.com ${who}, finish the security check, then reconnect that login on the Social page.`;
}

/** "Hotel Avalon Suites (Facebook, Instagram) · Danish Construction (Facebook)" */
export function blockedAccountsLine(login: BlockedLogin): string {
  return login.accounts.map((a) => `${a.project} (${a.platforms.join(", ")})`).join(" · ");
}

const pkt = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Emails Shoaib about held posts, unless an email already went out in the
 * last ALERT_EVERY_MS. `postId` is the post that was just held; it carries
 * `alerted_at` so the next run knows. Best-effort.
 */
export async function alertHeldPosts(postId: string): Promise<boolean> {
  if (!isResendConfigured) return false;
  const recent = await db
    .from("scheduled_posts")
    .select("id")
    .eq("status", "scheduled")
    .gte("result->held->>alerted_at", new Date(Date.now() - ALERT_EVERY_MS).toISOString())
    .limit(1);
  if (recent.data?.length) return false;

  const summary = await heldPostsSummary();
  if (!summary.count) return false;
  const posts = (n: number) => `${n} post${n === 1 ? "" : "s"}`;
  await resend.emails.send({
    from: fromEmail,
    to: toEmail,
    subject:
      summary.logins.length === 1
        ? `${blockedLoginTitle(summary.logins[0])} is blocked — ${posts(summary.count)} on hold`
        : `${summary.logins.length} social logins blocked — ${posts(summary.count)} on hold`,
    text: [
      `Meta says: ${summary.error ?? "the login is blocked"}`,
      ``,
      ...summary.logins.flatMap((login) => [
        `${blockedLoginTitle(login)} is blocked since ${pkt(login.since)} (PKT) — ${posts(login.count)} on hold.`,
        `Accounts: ${blockedAccountsLine(login)}`,
        `Fix: ${blockedLoginFix(login)} ${siteUrl}/dashboard/social`,
        ``,
      ]),
      `The held posts then go out by themselves, a few at a time. Stories held more than 12 hours and posts held more than 2 days are dropped as failed.`,
    ].join("\n"),
  });

  const { data: row } = await db.from("scheduled_posts").select("result").eq("id", postId).maybeSingle();
  const result = (row?.result ?? {}) as { held?: HoldInfo };
  if (result.held) {
    await db
      .from("scheduled_posts")
      .update({ result: { ...result, held: { ...result.held, alerted_at: new Date().toISOString() } } })
      .eq("id", postId);
  }
  return true;
}

/** After a reconnect: every held post may be tried on the next cron run. */
export async function releaseHeldPosts(): Promise<number> {
  const { data } = await db
    .from("scheduled_posts")
    .select("id, result")
    .eq("status", "scheduled")
    .not("result->held", "is", null);
  const now = new Date().toISOString();
  let released = 0;
  for (const row of data ?? []) {
    const result = row.result as { held: HoldInfo };
    const { error } = await db
      .from("scheduled_posts")
      .update({ result: { ...result, held: { ...result.held, next_try: now } } })
      .eq("id", row.id);
    if (!error) released++;
  }
  return released;
}
