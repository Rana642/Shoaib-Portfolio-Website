import "server-only";
import { db } from "./dashboard/db";
import { encryptToken, decryptToken } from "./social-crypto";
import { exchangeForLongLivedUserToken, facebookMe, listManagedPages, type DiscoveredPage } from "./social-fb";
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
  if (error) {
    throw new Error(
      slot === 2 && /check constraint/i.test(error.message)
        ? "A second Facebook login needs the database update first (social_connections id 2) — see supabase/dashboard-schema.sql."
        : error.message
    );
  }

  return listManagedPages(access_token);
}

/** Both Facebook logins for the Connections page, with whose profile each
 *  is (asked live — the name isn't stored). */
export async function listFacebookLogins(): Promise<{ slot: FacebookLoginSlot; connectedAt: string | null; expiresAt: string | null; name: string | null }[]> {
  const { data } = await db.from("social_connections").select("id, fb_user_token_encrypted, fb_token_expires_at, connected_at").order("id");
  const rows = (data ?? []) as { id: number; fb_user_token_encrypted: string | null; fb_token_expires_at: string | null; connected_at: string | null }[];
  return Promise.all(
    ([1, 2] as const).map(async (slot) => {
      const r = rows.find((x) => x.id === slot);
      let name: string | null = null;
      if (r?.fb_user_token_encrypted) {
        try {
          name = (await facebookMe(decryptToken(r.fb_user_token_encrypted))).name;
        } catch {
          name = null;
        }
      }
      return { slot, connectedAt: r?.fb_user_token_encrypted ? r.connected_at : null, expiresAt: r?.fb_token_expires_at ?? null, name };
    })
  );
}

/** Removes the second Facebook login. Pages already imported through it keep
 *  their own Page tokens and keep posting. */
export async function disconnectFacebookLogin(slot: FacebookLoginSlot) {
  if (slot === 1) throw new Error("The main Facebook login is replaced by reconnecting, not removed.");
  const { error } = await db.from("social_connections").delete().eq("id", slot);
  if (error) throw new Error(error.message);
}

/** Re-discovers Pages with every stored Facebook login, one list without
 *  duplicates (a Page both profiles can reach comes from login 1). */
export async function rediscoverFacebookPages(): Promise<DiscoveredPage[]> {
  const { data } = await db.from("social_connections").select("id, fb_user_token_encrypted").order("id");
  const logins = ((data ?? []) as { id: number; fb_user_token_encrypted: string | null }[]).filter((r) => r.fb_user_token_encrypted);
  if (!logins.length) throw new Error("No Facebook connection saved yet — connect one first.");
  const pages: DiscoveredPage[] = [];
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const login of logins) {
    try {
      for (const p of await listManagedPages(decryptToken(login.fb_user_token_encrypted!))) {
        if (seen.has(p.page_id)) continue;
        seen.add(p.page_id);
        pages.push(p);
      }
    } catch (e) {
      errors.push(`Facebook login ${login.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!pages.length && errors.length) throw new Error(errors.join(" · "));
  return pages;
}

/** Step 2 — persists the project mapping for a set of discovered Pages
 *  (and, where present, their linked Instagram Business Account). A client
 *  with multiple businesses maps different Pages to different projects. */
export async function saveFacebookPageMappings(
  mappings: { page: DiscoveredPage; project_id: string }[]
) {
  const rows = mappings.flatMap(({ page, project_id }) => {
    const out: {
      project_id: string;
      platform: SocialPlatform;
      label: string;
      external_id: string;
      access_token_encrypted: string;
    }[] = [
      {
        project_id,
        platform: "facebook",
        label: page.name,
        external_id: page.page_id,
        access_token_encrypted: encryptToken(page.page_access_token),
      },
    ];
    if (page.instagram_business_account_id) {
      out.push({
        project_id,
        platform: "instagram",
        label: `${page.name} (Instagram)`,
        external_id: page.instagram_business_account_id,
        access_token_encrypted: encryptToken(page.page_access_token),
      });
    }
    return out;
  });
  // An Instagram account the project already has (e.g. through Instagram
  // Login) isn't added a second time — it would post everything twice.
  const igIds = rows.filter((r) => r.platform === "instagram").map((r) => r.external_id);
  const { data: haveIg } = igIds.length
    ? await db.from("client_social_accounts").select("project_id, external_id").eq("platform", "instagram").in("external_id", igIds)
    : { data: [] };
  const taken = new Set(((haveIg ?? []) as { project_id: string; external_id: string }[]).map((r) => `${r.project_id}:${r.external_id}`));
  const fresh = rows.filter((r) => r.platform !== "instagram" || !taken.has(`${r.project_id}:${r.external_id}`));
  if (fresh.length === 0) return;
  const { error } = await db.from("client_social_accounts").insert(fresh);
  if (error) throw new Error(error.message);
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
 *  (LinkedIn has no simple "Graph API Explorer"; Shoaib generates one from
 *  his Developer app's own OAuth Token Generator) exchanged for the list of
 *  Company Pages he administers. Requires the app's Marketing Developer
 *  Platform product to be approved — see the note in social-linkedin.ts. */
export async function connectLinkedInAccount(memberToken: string): Promise<DiscoveredOrganization[]> {
  const orgs = await listManagedOrganizations(memberToken);
  await db.from("social_connections").upsert({
    id: 1,
    li_user_token_encrypted: encryptToken(memberToken),
    li_connected_at: new Date().toISOString(),
  });
  return orgs;
}

export async function rediscoverLinkedInOrganizations(): Promise<DiscoveredOrganization[]> {
  const { data, error } = await db.from("social_connections").select("li_user_token_encrypted").eq("id", 1).single();
  if (error || !data?.li_user_token_encrypted) {
    throw new Error("No LinkedIn connection saved yet — connect one first.");
  }
  return listManagedOrganizations(decryptToken(data.li_user_token_encrypted));
}

/** Persists the project mapping for discovered LinkedIn Company Pages. The
 *  member token itself (not a per-org token — LinkedIn doesn't split those
 *  out the way Meta does) is what gets used to post as each org. */
export async function saveLinkedInOrgMappings(mappings: { org: DiscoveredOrganization; project_id: string }[]) {
  const { data, error: tokenErr } = await db
    .from("social_connections")
    .select("li_user_token_encrypted")
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
  }));
  if (rows.length === 0) return;
  const { error } = await db.from("client_social_accounts").insert(rows);
  if (error) throw new Error(error.message);
}
