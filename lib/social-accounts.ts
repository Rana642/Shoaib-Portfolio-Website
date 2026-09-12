import "server-only";
import { db } from "./dashboard/db";
import { encryptToken, decryptToken } from "./social-crypto";
import { exchangeForLongLivedUserToken, listManagedPages, type DiscoveredPage } from "./social-fb";
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
export async function connectFacebookAccount(shortLivedToken: string): Promise<DiscoveredPage[]> {
  const { access_token, expires_in } = await exchangeForLongLivedUserToken(shortLivedToken);
  const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

  await db.from("social_connections").upsert({
    id: 1,
    fb_user_token_encrypted: encryptToken(access_token),
    fb_token_expires_at: expiresAt,
    connected_at: new Date().toISOString(),
  });

  return listManagedPages(access_token);
}

/** Re-discovers Pages using the already-stored long-lived User token
 *  (e.g. to refresh the list without re-pasting a token). */
export async function rediscoverFacebookPages(): Promise<DiscoveredPage[]> {
  const { data, error } = await db.from("social_connections").select("fb_user_token_encrypted").eq("id", 1).single();
  if (error || !data?.fb_user_token_encrypted) {
    throw new Error("No Facebook connection saved yet — connect one first.");
  }
  return listManagedPages(decryptToken(data.fb_user_token_encrypted));
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
  if (rows.length === 0) return;
  const { error } = await db.from("client_social_accounts").insert(rows);
  if (error) throw new Error(error.message);
}

export function decryptAccountToken(account: ClientSocialAccount): string {
  return decryptToken(account.access_token_encrypted);
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
