import "server-only";
import { db } from "./dashboard/db";
import { listFacebookLogins } from "./social-accounts";
import { blockedAccountsLine, heldPostsSummary, type BlockedLogin } from "./social-connection-hold";
import type { ClientSocialAccount } from "./dashboard/types";

/**
 * Every connection that is broken right now — for the dashboard's pop-up and
 * the red badge on Socially Snap → Settings (Shoaib, 2026-10-31: "alert pop mai
 * ana chaiye jahan jahan bhi connection kharab hai").
 *
 * - A Facebook login Meta has stopped (debug_token: invalid, or no permissions
 *   left), with the posts held behind it.
 * - An Instagram Login account that expired or whose posts are held.
 * - The LinkedIn login when it has expired or expires within 7 days.
 *
 * Posts held behind a login that works again are left out: they go out on
 * the next runs by themselves (Integrations shows them as "Posts retrying").
 * Cached for a minute per server instance — the sidebar polls the count.
 */

export type BrokenConnection = { key: string; title: string; detail: string };

const LINKEDIN_WARN_MS = 7 * 86_400_000;
const CACHE_MS = 60_000;
let cache: { at: number; items: BrokenConnection[] } | null = null;

const pkt = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

/** A login with no permissions left can't tell its own name, so fall back to
 *  the profile recorded on the Pages it imported (when only one other name is
 *  recorded). Shared with the Integrations page. */
export function loginNames(
  logins: { slot: 1 | 2; connectedAt: string | null; name: string | null }[],
  accounts: Pick<ClientSocialAccount, "fb_login_name">[]
): { 1: string | null; 2: string | null } {
  const first = logins.find((l) => l.slot === 1);
  const second = logins.find((l) => l.slot === 2);
  const recorded = [...new Set(accounts.map((a) => a.fb_login_name).filter((n): n is string => Boolean(n)))];
  const others = recorded.filter((n) => n !== first?.name);
  return {
    1: first?.name ?? null,
    2: second?.connectedAt ? (second.name ?? (others.length === 1 ? others[0] : null)) : null,
  };
}

export async function brokenConnections(): Promise<BrokenConnection[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.items;

  const [logins, { data: accountRows }, held, { data: li }] = await Promise.all([
    listFacebookLogins(),
    db.from("client_social_accounts").select("*").eq("is_active", true),
    heldPostsSummary().catch(() => ({ count: 0, error: null, logins: [] as BlockedLogin[] })),
    db.from("social_connections").select("li_token_expires_at").eq("id", 1).maybeSingle(),
  ]);
  const accounts = (accountRows ?? []) as ClientSocialAccount[];
  const names = loginNames(logins, accounts);
  const items: BrokenConnection[] = [];

  for (const login of logins) {
    if (!login.connectedAt || login.works !== false) continue;
    const name = names[login.slot];
    const blocked = name ? held.logins.find((l) => l.kind === "facebook" && l.name === name) : undefined;
    const pages = name ? accounts.filter((a) => a.platform === "facebook" && a.fb_login_name === name).length : 0;
    items.push({
      key: `facebook-${login.slot}`,
      title: `${name ? `${name}'s` : login.slot === 2 ? "The second" : "The main"} Facebook login has stopped`,
      detail: blocked
        ? `Since ${pkt(blocked.since)}, ${blocked.count} post${blocked.count === 1 ? "" : "s"} on hold: ${blockedAccountsLine(blocked)}.`
        : `${pages || "Its"} Page${pages === 1 ? "" : "s"} can't post until it is reconnected.`,
    });
  }

  // Instagram Login accounts: expired, or posts held behind them.
  const now = Date.now();
  for (const a of accounts.filter((x) => x.platform === "instagram" && x.token_expires_at)) {
    const blocked = held.logins.find((l) => l.kind === "instagram" && l.name === a.label);
    if (new Date(a.token_expires_at!).getTime() > now && !blocked) continue;
    items.push({
      key: `instagram-${a.id}`,
      title: `Instagram login ${a.label} needs reconnecting`,
      detail: blocked
        ? `Since ${pkt(blocked.since)}, ${blocked.count} post${blocked.count === 1 ? "" : "s"} on hold: ${blockedAccountsLine(blocked)}.`
        : `Its login expired on ${pkt(a.token_expires_at!)}.`,
    });
  }

  const liExpires = (li as { li_token_expires_at: string | null } | null)?.li_token_expires_at;
  if (liExpires && new Date(liExpires).getTime() - now < LINKEDIN_WARN_MS) {
    const expired = new Date(liExpires).getTime() <= now;
    items.push({
      key: "linkedin",
      title: expired ? "The LinkedIn login has expired" : "The LinkedIn login expires soon",
      detail: `${expired ? "Expired" : "Expires"} ${pkt(liExpires)}. Reconnect it so Company Page posts keep going out.`,
    });
  }

  cache = { at: Date.now(), items };
  return items;
}
