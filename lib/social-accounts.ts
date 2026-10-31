import "server-only";
import { db } from "./dashboard/db";
import { encryptToken, decryptToken } from "./social-crypto";
import {
  exchangeForLongLivedUserToken,
  facebookMe,
  facebookTokenInfo,
  INSTAGRAM_SCOPES_NEEDED,
  listManagedPages,
  PAGE_SCOPES_NEEDED,
  type DiscoveredPage,
  type PageChoice,
} from "./social-fb";
import { listManagedOrganizations, type DiscoveredOrganization } from "./social-linkedin";
import type { ClientSocialAccount, SocialPlatform } from "./dashboard/types";

export async function listAllSocialAccounts(): Promise<ClientSocialAccount[]> {
  const { data, error } = await db.from("client_social_accounts").select("*").order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as ClientSocialAccount[];
}

export async function listSocialAccountsForProject(projectId: string): Promise<ClientSocialAccount[]> {
  const { data, error } = await db
    .from("client_social_accounts")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  return (data ?? []) as ClientSocialAccount[];
}

export async function removeSocialAccount(id: string) {
  const { error } = await db.from("client_social_accounts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function addManualSocialAccount(input: {
  project_id: string;
  platform: SocialPlatform;
  label: string;
  external_id: string;
  access_token: string;
  token_expires_at?: string | null;
}) {
  const { error } = await db.from("client_social_accounts").insert({
    project_id: input.project_id,
    platform: input.platform,
    label: input.label,
    external_id: input.external_id,
    access_token_encrypted: encryptToken(input.access_token),
    token_expires_at: input.token_expires_at ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Step 1 of the Facebook connect flow — exchanges the pasted short-lived
 *  User token for a long-lived one, stores it, and returns the discovered
 *  Pages for the dashboard to map to projects. Doesn't create any
 *  client_social_accounts rows yet — that happens in saveFacebookPageMappings. */
/** Up to two Facebook profiles can discover Pages (social_connections rows
 *  1 and 2): Shoaib's own, plus one more profile with access to other
 *  clients' Pages (Shoaib, 2026-10-01 — his wife's, added as a tester on the
 *  app). Row 1 also carries the LinkedIn login. */
export type FacebookLoginSlot = 1 | 2;

export async function connectFacebookAccount(shortLivedToken: string, slot: FacebookLoginSlot = 1): Promise<DiscoveredPage[]> {
  const { access_token, expires_in } = await exchangeForLongLivedUserToken(shortLivedToken);
  // A System User token has no expires_in at all (it doesn't expire) —
  // leave fb_token_expires_at null rather than crash on Date(NaN).
  const expiresAt = expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null;
  const me = await facebookMe(access_token);

  // The same profile in both slots would only duplicate the Page list.
  const { data: other } = await db.from("social_connections").select("fb_user_id").eq("id", slot === 1 ? 2 : 1).maybeSingle();
  if (other?.fb_user_id && other.fb_user_id === me.id) {
    throw new Error(`${me.name} is already the other Facebook login. Log out of Facebook in this browser (or use a private window), then connect the other profile.`);
  }

  const { error } = await db.from("social_connections").upsert({
    id: slot,
    fb_user_id: me.id,
    fb_user_token_encrypted: encryptToken(access_token),
    fb_token_expires_at: expiresAt,
    connected_at: new Date().toISOString(),
  });
  loginsCache = null; // the login just changed — show its new health right away
  if (error) {
    throw new Error(
      slot === 2 && /check constraint/i.test(error.message)
        ? "A second Facebook login needs the database update first (social_connections id 2) — see supabase/dashboard-schema.sql."
        : error.message
    );
  }

  return listManagedPages(access_token);
}

/** Needed permissions a token's scopes lack (none known = nothing reported missing). */
const missingOf = (scopes: string[] | null, needed: string[]) => (scopes ? needed.filter((s) => !scopes.includes(s)) : []);

export type FacebookLoginStatus = {
  slot: FacebookLoginSlot;
  connectedAt: string | null;
  expiresAt: string | null;
  name: string | null;
  /** The Facebook user behind it — matches a stored Page token to its login. */
  userId: string | null;
  /** Meta says it still works (valid AND some permission); null = couldn't tell. */
  works: boolean | null;
  /** Permissions the Planner needs that this login hasn't granted. */
  missing: string[];
};

/** Both Facebook logins for the Integrations page, with whose profile each
 *  is (asked live — the name isn't stored), whether it still works and which
 *  needed permissions it lacks (debug_token). Cached 5 minutes per server
 *  instance: /me and debug_token count against the app's hourly platform
 *  limit, which ran out on 2026-10-31 (#4). A reconnect clears it. */
let loginsCache: { at: number; value: FacebookLoginStatus[] } | null = null;
export async function listFacebookLogins(): Promise<FacebookLoginStatus[]> {
  if (loginsCache && Date.now() - loginsCache.at < 5 * 60_000) return loginsCache.value;
  const value = await listFacebookLoginsLive();
  // Don't keep an answer Meta refused (rate limit): unknown health isn't news.
  if (value.every((l) => !l.connectedAt || l.works !== null)) loginsCache = { at: Date.now(), value };
  return value;
}

async function listFacebookLoginsLive(): Promise<FacebookLoginStatus[]> {
  const { data } = await db.from("social_connections").select("id, fb_user_id, fb_user_token_encrypted, fb_token_expires_at, connected_at").order("id");
  const rows = (data ?? []) as { id: number; fb_user_id: string | null; fb_user_token_encrypted: string | null; fb_token_expires_at: string | null; connected_at: string | null }[];
  return Promise.all(
    ([1, 2] as const).map(async (slot) => {
      const r = rows.find((x) => x.id === slot);
      let name: string | null = null;
      let works: boolean | null = null;
      let missing: string[] = [];
      if (r?.fb_user_token_encrypted) {
        const token = decryptToken(r.fb_user_token_encrypted);
        const [me, info] = await Promise.all([facebookMe(token).catch(() => null), facebookTokenInfo(token)]);
        name = me?.name ?? null;
        works = info ? info.valid && info.scopes.length > 0 : null;
        missing = info?.valid ? missingOf(info.scopes, [...PAGE_SCOPES_NEEDED, ...INSTAGRAM_SCOPES_NEEDED]) : [];
      }
      return {
        slot,
        connectedAt: r?.fb_user_token_encrypted ? r.connected_at : null,
        expiresAt: r?.fb_token_expires_at ?? null,
        name,
        userId: r?.fb_user_token_encrypted ? r.fb_user_id : null,
        works,
        missing,
      };
    })
  );
}

/** Every stored Facebook login, decrypted, with whose profile it is and the
 *  permissions it holds (null = Meta didn't say). Server only. */
async function storedFacebookLogins() {
  const { data } = await db.from("social_connections").select("id, fb_user_id, fb_user_token_encrypted, connected_at").order("id");
  const rows = ((data ?? []) as { id: number; fb_user_id: string | null; fb_user_token_encrypted: string | null; connected_at: string | null }[]).filter(
    (r) => r.fb_user_token_encrypted && (r.id === 1 || r.id === 2)
  );
  return Promise.all(
    rows.map(async (r) => {
      const token = decryptToken(r.fb_user_token_encrypted!);
      // /me sometimes fails once (seen 2026-10-31) — one retry before giving up.
      const [me, info] = await Promise.all([
        facebookMe(token)
          .catch(() => facebookMe(token))
          .catch(() => null),
        facebookTokenInfo(token),
      ]);
      return {
        slot: r.id as FacebookLoginSlot,
        token,
        connectedAt: r.connected_at,
        /** For display; a placeholder when Meta didn't say. */
        name: me?.name ?? `Facebook login ${r.id}`,
        /** The profile's real name, or null — only this is ever saved as fb_login_name. */
        realName: me?.name ?? null,
        userId: info?.userId ?? me?.id ?? r.fb_user_id,
        scopes: info ? info.scopes : null,
      };
    })
  );
}
type StoredLogin = Awaited<ReturnType<typeof storedFacebookLogins>>[number];
/** What's needed to tell which login a stored token came from. */
type LoginRef = { slot: FacebookLoginSlot; name: string | null; userId: string | null };

/** One login that reaches a Page: its token for that Page and the needed
 *  permissions it lacks for the Page (`missing`) and its Instagram (`igMissing`). */
type PageSource = { slot: FacebookLoginSlot; name: string; realName: string | null; missing: string[]; igMissing: string[]; page: DiscoveredPage };

/** Every Page the stored logins reach, with each login that reaches it — a
 *  Page both profiles admin comes back twice, once per login. Tokens stay here. */
async function discoverPagesByLogin(): Promise<{ byPage: Map<string, PageSource[]>; logins: StoredLogin[] }> {
  const logins = await storedFacebookLogins();
  if (!logins.length) throw new Error("No Facebook connection saved yet — connect one first.");
  const byPage = new Map<string, PageSource[]>();
  const errors: string[] = [];
  for (const l of logins) {
    try {
      for (const page of await listManagedPages(l.token)) {
        const list = byPage.get(page.page_id) ?? [];
        list.push({
          slot: l.slot,
          name: l.name,
          realName: l.realName,
          missing: missingOf(l.scopes, PAGE_SCOPES_NEEDED),
          igMissing: missingOf(l.scopes, INSTAGRAM_SCOPES_NEEDED),
          page,
        });
        byPage.set(page.page_id, list);
      }
    } catch (e) {
      errors.push(`Facebook login ${l.slot}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!byPage.size && errors.length) throw new Error(errors.join(" · "));
  return { byPage, logins };
}

/** Which login a Page (or its Instagram) should hang off: the one already
 *  holding it when it lacks nothing, else the one lacking the fewest needed
 *  permissions (the current one, then login 1, on a tie). Never "the login
 *  just reconnected wins" — on 2026-10-31 that moved 9 Pages to a login that
 *  hadn't granted pages_read_user_content and broke their Facebook insights. */
function bestSource(sources: PageSource[], currentSlot: FacebookLoginSlot | null, which: "missing" | "igMissing" = "missing"): PageSource {
  const current = sources.find((s) => s.slot === currentSlot);
  if (current && current[which].length === 0) return current;
  return [...sources].sort(
    (a, b) => a[which].length - b[which].length || Number(b.slot === currentSlot) - Number(a.slot === currentSlot) || a.slot - b.slot
  )[0];
}

/** For each stored Page/Instagram token: the login it came from (debug_token
 *  user → login), whether it still works, and the needed permissions it lacks.
 *  Keyed by client_social_accounts.id. */
async function storedTokenOwners(logins: LoginRef[]) {
  const { data } = await db
    .from("client_social_accounts")
    .select("id, platform, external_id, access_token_encrypted, token_expires_at, fb_login_name")
    .in("platform", ["facebook", "instagram"])
    .eq("is_active", true);
  const rows = ((data ?? []) as { id: string; platform: string; external_id: string; access_token_encrypted: string; token_expires_at: string | null; fb_login_name: string | null }[]).filter(
    (a) => !(a.platform === "instagram" && a.token_expires_at) // Instagram Login accounts have their own token
  );
  const out = new Map<string, { platform: string; external_id: string; slot: FacebookLoginSlot | null; name: string | null; valid: boolean; missing: string[] }>();
  await Promise.all(
    rows.map(async (a) => {
      const info = await facebookTokenInfo(decryptToken(a.access_token_encrypted));
      const login = info?.userId ? logins.find((l) => l.userId === info.userId) : undefined;
      out.set(a.id, {
        platform: a.platform,
        external_id: a.external_id,
        slot: login?.slot ?? null,
        name: login?.name ?? a.fb_login_name,
        valid: info ? info.valid : true,
        missing: info?.valid ? missingOf(info.scopes, a.platform === "facebook" ? PAGE_SCOPES_NEEDED : INSTAGRAM_SCOPES_NEEDED) : [],
      });
    })
  );
  return out;
}

/** The import dialog's list: every Page the logins reach, the logins that
 *  reach it, and — once imported — the login its stored token came from. */
export async function facebookPageChoices(): Promise<PageChoice[]> {
  const { byPage, logins } = await discoverPagesByLogin();
  const owners = await storedTokenOwners(logins);
  const boundByPage = new Map([...owners.values()].filter((o) => o.platform === "facebook").map((o) => [o.external_id, o]));
  return [...byPage.values()].map((sources) => {
    const page = sources[0].page;
    const bound = boundByPage.get(page.page_id);
    return {
      page_id: page.page_id,
      name: page.name,
      instagram_business_account_id: sources.find((s) => s.page.instagram_business_account_id)?.page.instagram_business_account_id ?? null,
      logins: sources.map((s) => ({ slot: s.slot, name: s.name, missing: s.missing })),
      bound: bound ? { slot: bound.slot, name: bound.name, missing: bound.missing, valid: bound.valid } : null,
    };
  });
}

/** Integrations: for each Facebook/Instagram account, the login its token
 *  came from and what's wrong with that token, if anything. Cached briefly —
 *  one debug_token per account. Cleared when tokens change. */
let ownersCache: { at: number; value: Record<string, { via: string | null; valid: boolean; missing: string[] }> } | null = null;
export async function facebookAccountOwners(logins: LoginRef[]) {
  if (ownersCache && Date.now() - ownersCache.at < 10 * 60_000) return ownersCache.value;
  const owners = await storedTokenOwners(logins);
  const value = Object.fromEntries([...owners].map(([id, o]) => [id, { via: o.name, valid: o.valid, missing: o.missing }]));
  ownersCache = { at: Date.now(), value };
  return value;
}

/** Removes the second Facebook login. Pages already imported through it keep
 *  their own Page tokens and keep posting. */
export async function disconnectFacebookLogin(slot: FacebookLoginSlot) {
  if (slot === 1) throw new Error("The main Facebook login is replaced by reconnecting, not removed.");
  const { error } = await db.from("social_connections").delete().eq("id", slot);
  if (error) throw new Error(error.message);
}

/** Step 2 — persists the project mapping for the Pages picked in the import
 *  dialog (and, where present, their linked Instagram Business Account). A
 *  client with multiple businesses maps different Pages to different
 *  projects. The browser sends only Page ids and, optionally, which login to
 *  use (`login_slot`): Pages and their tokens are re-discovered here and the
 *  login is checked against them, so a token never passes through the browser.
 *  - A new Page takes the chosen login's token, else the best one (bestSource).
 *  - An already-imported Page with a login chosen is moved to that login (its
 *    Facebook and Instagram rows on that project) — only when picked in the
 *    dialog; nothing else is touched (no global token refresh: that was the
 *    re-bind of 2026-10-31).
 *  - Nothing a project already has is added twice, so picking an imported
 *    Page adds just its Instagram when that was linked later (Tad, 2026-10-21).
 *  Returns how many rows were added or moved. */
export async function saveFacebookPageMappings(mappings: { page_id: string; project_id: string; login_slot?: FacebookLoginSlot }[]): Promise<number> {
  const { byPage, logins } = await discoverPagesByLogin();
  const owners = await storedTokenOwners(logins);
  const ownerOf = (platform: string, externalId: string) => [...owners.values()].find((o) => o.platform === platform && o.external_id === externalId);

  const picks = mappings.map((m) => {
    const sources = byPage.get(m.page_id);
    if (!sources?.length) throw new Error("A selected Page isn't reachable through your Facebook logins any more. Reconnect, then import again.");
    const source = m.login_slot ? sources.find((s) => s.slot === m.login_slot) : bestSource(sources, ownerOf("facebook", m.page_id)?.slot ?? null);
    if (!source) throw new Error(`${sources[0].page.name} isn't reachable through that Facebook login. Pick the other login for it.`);
    // A login can reach the Page without its Instagram (not granted at that
    // login): the Instagram then takes a token from a login that has it.
    const igId = sources.find((s) => s.page.instagram_business_account_id)?.page.instagram_business_account_id ?? null;
    const igSource = source.page.instagram_business_account_id ? source : sources.find((s) => s.page.instagram_business_account_id) ?? null;
    return { ...m, source, igId, igSource };
  });

  const ids = picks.flatMap((p) => [p.page_id, ...(p.igId ? [p.igId] : [])]);
  const { data: have } = await db
    .from("client_social_accounts")
    .select("id, project_id, platform, external_id, token_expires_at")
    .in("platform", ["facebook", "instagram"])
    .in("external_id", ids);
  const existing = (have ?? []) as { id: string; project_id: string; platform: string; external_id: string; token_expires_at: string | null }[];
  const find = (projectId: string, platform: string, externalId: string) =>
    existing.find((r) => r.project_id === projectId && r.platform === platform && r.external_id === externalId);

  const inserts: { project_id: string; platform: SocialPlatform; label: string; external_id: string; access_token_encrypted: string; fb_login_name: string | null }[] = [];
  const moves: { id: string; token: string; login: string | null }[] = [];
  for (const { project_id, page_id, login_slot, source, igId, igSource } of picks) {
    const fb = find(project_id, "facebook", page_id);
    if (!fb) {
      inserts.push({ project_id, platform: "facebook", label: source.page.name, external_id: page_id, access_token_encrypted: encryptToken(source.page.page_access_token), fb_login_name: source.realName });
    } else if (login_slot && ownerOf("facebook", page_id)?.slot !== login_slot) {
      moves.push({ id: fb.id, token: source.page.page_access_token, login: source.realName });
    }
    if (igId && igSource) {
      const ig = find(project_id, "instagram", igId);
      // An Instagram the project already has through Instagram Login is left
      // alone — adding it again would post everything twice.
      if (!ig) {
        inserts.push({ project_id, platform: "instagram", label: `${source.page.name} (Instagram)`, external_id: igId, access_token_encrypted: encryptToken(igSource.page.page_access_token), fb_login_name: igSource.realName });
      } else if (!ig.token_expires_at && login_slot && igSource.slot === login_slot && ownerOf("instagram", igId)?.slot !== login_slot) {
        moves.push({ id: ig.id, token: igSource.page.page_access_token, login: igSource.realName });
      }
    }
  }

  if (inserts.length) {
    const { error } = await db.from("client_social_accounts").insert(inserts);
    if (error) throw new Error(error.message);
  }
  for (const m of moves) {
    const { error } = await db
      .from("client_social_accounts")
      .update({ access_token_encrypted: encryptToken(m.token), ...(m.login ? { fb_login_name: m.login } : {}) })
      .eq("id", m.id);
    if (error) throw new Error(error.message);
  }
  ownersCache = null;
  return inserts.length + moves.length;
}

export function decryptAccountToken(account: ClientSocialAccount): string {
  return decryptToken(account.access_token_encrypted);
}

export function decryptAccountRefreshToken(account: ClientSocialAccount): string | null {
  return account.refresh_token_encrypted ? decryptToken(account.refresh_token_encrypted) : null;
}

/** Saves (or re-saves, on reconnect) a TikTok creator account. Unlike
 *  Facebook/LinkedIn there's no separate "discover, then map" step — Login
 *  Kit's OAuth consent already scopes to exactly one creator account per
 *  authorization, with the target project chosen up front (carried through
 *  as the `state` param), so this both discovers and persists in one call.
 *  No unique DB constraint backs an upsert here, so this checks manually. */
export async function saveTikTokAccount(input: {
  project_id: string;
  open_id: string;
  display_name: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
}) {
  const tokenFields = {
    label: input.display_name,
    access_token_encrypted: encryptToken(input.access_token),
    refresh_token_encrypted: encryptToken(input.refresh_token),
    token_expires_at: new Date(Date.now() + input.expires_in * 1000).toISOString(),
    is_active: true,
  };
  const { data: existing } = await db
    .from("client_social_accounts")
    .select("id")
    .eq("project_id", input.project_id)
    .eq("platform", "tiktok")
    .eq("external_id", input.open_id)
    .maybeSingle();

  if (existing) {
    const { error } = await db.from("client_social_accounts").update(tokenFields).eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db
      .from("client_social_accounts")
      .insert({ project_id: input.project_id, platform: "tiktok", external_id: input.open_id, ...tokenFields });
    if (error) throw new Error(error.message);
  }
}

/** Saves an Instagram account connected through Instagram Login (see
 *  lib/social-instagram-login.ts) — platform "instagram" with an expiring
 *  token, which is what marks it as a login account. Refuses an account the
 *  project already has through its Facebook Page, which would post twice. */
export async function saveInstagramLoginAccount(input: {
  project_id: string;
  ig_user_id: string;
  username: string;
  access_token: string;
  expires_in: number;
}): Promise<"created" | "updated"> {
  const { data: existing } = await db
    .from("client_social_accounts")
    .select("id, token_expires_at")
    .eq("project_id", input.project_id)
    .eq("platform", "instagram")
    .eq("external_id", input.ig_user_id)
    .maybeSingle();
  if (existing && existing.token_expires_at === null) {
    throw new Error(`@${input.username} is already connected to this project through its Facebook Page — no need to log in with Instagram.`);
  }
  const fields = {
    label: `@${input.username}`,
    access_token_encrypted: encryptToken(input.access_token),
    refresh_token_encrypted: null,
    token_expires_at: new Date(Date.now() + input.expires_in * 1000).toISOString(),
    is_active: true,
  };
  if (existing) {
    const { error } = await db.from("client_social_accounts").update(fields).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return "updated";
  }
  const { error } = await db.from("client_social_accounts").insert({ project_id: input.project_id, platform: "instagram", external_id: input.ig_user_id, ...fields });
  if (error) throw new Error(error.message);
  return "created";
}

export async function updateInstagramLoginToken(accountId: string, accessToken: string, expiresIn: number) {
  const { error } = await db
    .from("client_social_accounts")
    .update({ access_token_encrypted: encryptToken(accessToken), token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString() })
    .eq("id", accountId);
  if (error) throw new Error(error.message);
}

/** Persists a rotated TikTok access/refresh token pair after a refresh call
 *  — TikTok's refresh_token itself rotates on every use, so the old one
 *  stops working right after and must be overwritten, not just the access token. */
export async function updateTikTokAccountTokens(
  accountId: string,
  tokens: { access_token: string; refresh_token: string; expires_in: number }
) {
  const { error } = await db
    .from("client_social_accounts")
    .update({
      access_token_encrypted: encryptToken(tokens.access_token),
      refresh_token_encrypted: encryptToken(tokens.refresh_token),
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    })
    .eq("id", accountId);
  if (error) throw new Error(error.message);
}

/** LinkedIn equivalent of connectFacebookAccount — a member access token
 *  (from the "Connect with LinkedIn" OAuth flow, or pasted by hand) exchanged
 *  for the list of Company Pages he administers. Company Pages already on
 *  projects get the new token too, since LinkedIn has no per-Page token and
 *  the old one dies after 60 days (see lib/social-linkedin.ts). */
export async function connectLinkedInAccount(memberToken: string, expiresIn: number | null = null): Promise<DiscoveredOrganization[]> {
  const orgs = await listManagedOrganizations(memberToken, await knownLinkedInNames());
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
  const encrypted = encryptToken(memberToken);
  await db.from("social_connections").upsert({
    id: 1,
    li_user_token_encrypted: encrypted,
    li_token_expires_at: expiresAt,
    li_connected_at: new Date().toISOString(),
  });
  const admined = orgs.map((o) => o.organization_urn);
  if (admined.length) {
    await db
      .from("client_social_accounts")
      .update({ access_token_encrypted: encrypted, token_expires_at: expiresAt })
      .eq("platform", "linkedin")
      .in("external_id", admined);
  }
  return orgs;
}

export async function rediscoverLinkedInOrganizations(): Promise<DiscoveredOrganization[]> {
  const { data, error } = await db.from("social_connections").select("li_user_token_encrypted").eq("id", 1).single();
  if (error || !data?.li_user_token_encrypted) {
    throw new Error("No LinkedIn connection saved yet — connect one first.");
  }
  return listManagedOrganizations(decryptToken(data.li_user_token_encrypted), await knownLinkedInNames());
}

/** Names of Company Pages already imported — reused so no LinkedIn quota is
 *  spent looking them up again (Development Tier: 100 lookups a day). */
async function knownLinkedInNames(): Promise<Map<string, string>> {
  const { data } = await db
    .from("client_social_accounts")
    .select("external_id, label")
    .eq("platform", "linkedin")
    .like("external_id", "urn:li:organization:%");
  return new Map((data ?? []).map((r) => [r.external_id as string, r.label as string]));
}

/** Persists the project mapping for discovered LinkedIn Company Pages. The
 *  member token itself (not a per-org token — LinkedIn doesn't split those
 *  out the way Meta does) is what gets used to post as each org. */
export async function saveLinkedInOrgMappings(mappings: { org: DiscoveredOrganization; project_id: string }[]) {
  const { data, error: tokenErr } = await db
    .from("social_connections")
    .select("li_user_token_encrypted, li_token_expires_at")
    .eq("id", 1)
    .single();
  if (tokenErr || !data?.li_user_token_encrypted) throw new Error("No LinkedIn connection saved yet.");
  const memberToken = data.li_user_token_encrypted; // already encrypted — reuse as-is per row

  const rows = mappings.map(({ org, project_id }) => ({
    project_id,
    platform: "linkedin" as const,
    label: org.name,
    external_id: org.organization_urn,
    access_token_encrypted: memberToken,
    token_expires_at: data.li_token_expires_at ?? null,
  }));
  if (rows.length === 0) return;
  const { error } = await db.from("client_social_accounts").insert(rows);
  if (error) throw new Error(error.message);
}

/**
 * Re-derive the Page token of every Facebook Page (and its linked Instagram
 * account) that's already on a project, from both stored Facebook logins.
 * Page tokens die with the user session that produced them — e.g. after a
 * password change or "log out of all sessions" — and reconnecting only
 * refreshed the user token, leaving projects on dead Page tokens (Instagram
 * posts for both hotels failed for days, 2026-10). Runs after every
 * Facebook (re)connect. Instagram Login accounts (their own tokens) are
 * left alone.
 */
export async function refreshFacebookPageTokens(): Promise<{ updated: number; moved: string[]; missing: string[] }> {
  // Each account keeps the login it already hangs off, with a fresh token
  // from that login — unless that login lacks a needed permission and the
  // other has more (bestSource). Until 2026-10-31 "the login just reconnected
  // wins" moved every Page both profiles reach onto the newest login, even one
  // without pages_read_user_content, and broke 9 Pages' Facebook insights.
  let found: Awaited<ReturnType<typeof discoverPagesByLogin>>;
  try {
    found = await discoverPagesByLogin();
  } catch {
    return { updated: 0, moved: [], missing: [] };
  }
  const { byPage, logins } = found;
  const byIg = new Map<string, PageSource[]>();
  for (const sources of byPage.values()) {
    for (const s of sources) {
      const ig = s.page.instagram_business_account_id;
      if (ig) byIg.set(ig, [...(byIg.get(ig) ?? []), s]);
    }
  }
  const owners = await storedTokenOwners(logins);
  const { data: accounts } = await db
    .from("client_social_accounts")
    .select("id, platform, label, external_id, token_expires_at")
    .in("platform", ["facebook", "instagram"])
    .eq("is_active", true);
  let updated = 0;
  const moved: string[] = [];
  const missing: string[] = [];
  for (const a of accounts ?? []) {
    if (a.platform === "instagram" && a.token_expires_at) continue; // Instagram Login account
    const sources = a.platform === "facebook" ? byPage.get(a.external_id) : byIg.get(a.external_id);
    if (!sources?.length) {
      missing.push(a.label);
      continue;
    }
    const currentSlot = owners.get(a.id)?.slot ?? null;
    const pick = bestSource(sources, currentSlot, a.platform === "facebook" ? "missing" : "igMissing");
    await db.from("client_social_accounts").update({ access_token_encrypted: encryptToken(pick.page.page_access_token) }).eq("id", a.id);
    // Separate and unchecked: fb_login_name comes from a later migration, and
    // a database without it must still get the fresh token above. It names the
    // profile for blocked-login alerts (lib/social-connection-hold.ts) — only
    // a real name, never the "Facebook login N" placeholder.
    if (pick.realName) await db.from("client_social_accounts").update({ fb_login_name: pick.realName }).eq("id", a.id);
    if (currentSlot !== null && pick.slot !== currentSlot) moved.push(`${a.label} → ${pick.name}`);
    updated++;
  }
  ownersCache = null;
  return { updated, moved, missing };
}
