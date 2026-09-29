import "server-only";
import { db } from "./dashboard/db";
import { GRAPH_BASE } from "./social-fb";
import { decryptToken, encryptToken } from "./social-crypto";

/**
 * Per-project Meta Ads connections made through "Facebook Login for
 * Business" on the "ABS Marketing" app — the client (or Shoaib on their
 * behalf) grants their own ad accounts and Pages, and the dashboard's
 * /dashboard/ads page manages campaigns with THAT token. This is the
 * client-facing flow Meta's App Review needs to see for ads_management /
 * ads_read / business_management / pages_show_list / pages_read_engagement.
 * The meta_ads_* MCP tools keep using the API Vault's System User token.
 */

export type MetaAdAccount = { id: string; name: string; currency?: string; account_status?: number; business_name?: string };
export type MetaPage = { id: string; name: string; picture?: string | null; category?: string | null };

export type MetaAdConnection = {
  id: string;
  project_id: string;
  connected_user_id: string | null;
  connected_user_name: string | null;
  ad_accounts: MetaAdAccount[];
  pages: MetaPage[];
  selected_ad_account_id: string | null;
  token_expires_at: string | null;
  connected_at: string;
};

export type MetaCampaign = {
  id: string;
  name: string;
  objective: string;
  status: string;
  effective_status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
};

export const CAMPAIGN_OBJECTIVES = [
  { value: "OUTCOME_AWARENESS", label: "Awareness" },
  { value: "OUTCOME_TRAFFIC", label: "Traffic" },
  { value: "OUTCOME_ENGAGEMENT", label: "Engagement" },
  { value: "OUTCOME_LEADS", label: "Leads" },
  { value: "OUTCOME_SALES", label: "Sales" },
] as const;

type GraphError = { error?: { message?: string } };

export async function graph<T>(token: string, path: string, method: "GET" | "POST" = "GET", params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${GRAPH_BASE}/${path.replace(/^\//, "")}`);
  let init: RequestInit = { cache: "no-store" };
  if (method === "GET") {
    url.searchParams.set("access_token", token);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  } else {
    const body = new URLSearchParams({ ...params, access_token: token });
    init = { method: "POST", body, cache: "no-store" };
  }
  const res = await fetch(url.toString(), init);
  const json = (await res.json()) as T & GraphError;
  if (!res.ok || json.error) throw new Error(json.error?.message || `Meta API error (HTTP ${res.status})`);
  return json;
}

/** Everything the connect callback discovers with the client's token. */
export async function discoverWithToken(token: string) {
  const me = await graph<{ id: string; name: string }>(token, "me", "GET", { fields: "id,name" });

  const fields = "id,name,account_status,currency,business_name";
  const accounts = new Map<string, MetaAdAccount>();
  const direct = await graph<{ data?: MetaAdAccount[] }>(token, "me/adaccounts", "GET", { fields, limit: "200" });
  for (const a of direct.data ?? []) accounts.set(a.id, a);
  const businesses = await graph<{ data?: { id: string }[] }>(token, "me/businesses", "GET", { fields: "id", limit: "100" });
  for (const b of businesses.data ?? []) {
    for (const edge of ["owned_ad_accounts", "client_ad_accounts"]) {
      try {
        const res = await graph<{ data?: MetaAdAccount[] }>(token, `${b.id}/${edge}`, "GET", { fields, limit: "200" });
        for (const a of res.data ?? []) accounts.set(a.id, a);
      } catch {
        /* no permission on this edge for this business — skip */
      }
    }
  }

  let pages: MetaPage[] = [];
  try {
    const res = await graph<{ data?: { id: string; name: string; category?: string; picture?: { data?: { url?: string } } }[] }>(token, "me/accounts", "GET", {
      fields: "id,name,category,picture{url}",
      limit: "100",
    });
    pages = (res.data ?? []).map((p) => ({ id: p.id, name: p.name, category: p.category ?? null, picture: p.picture?.data?.url ?? null }));
  } catch {
    /* Pages weren't granted — ads can still be managed, the list just stays empty */
  }

  return { me, accounts: [...accounts.values()], pages };
}

export async function saveConnection(
  projectId: string,
  token: string,
  expiresInSeconds: number | null,
  found: Awaited<ReturnType<typeof discoverWithToken>>
) {
  const { data: existing } = await db.from("meta_ad_connections").select("selected_ad_account_id").eq("project_id", projectId).maybeSingle();
  const keep = existing?.selected_ad_account_id && found.accounts.some((a) => a.id === existing.selected_ad_account_id);
  const { error } = await db.from("meta_ad_connections").upsert(
    {
      project_id: projectId,
      access_token_enc: encryptToken(token),
      token_expires_at: expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000).toISOString() : null,
      connected_user_id: found.me.id,
      connected_user_name: found.me.name,
      ad_accounts: found.accounts,
      pages: found.pages,
      selected_ad_account_id: keep ? existing!.selected_ad_account_id : found.accounts.length === 1 ? found.accounts[0].id : null,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "project_id" }
  );
  if (error) throw new Error(error.message);
}

export async function getConnection(projectId: string): Promise<MetaAdConnection | null> {
  const { data } = await db
    .from("meta_ad_connections")
    .select("id, project_id, connected_user_id, connected_user_name, ad_accounts, pages, selected_ad_account_id, token_expires_at, connected_at")
    .eq("project_id", projectId)
    .maybeSingle();
  return (data as MetaAdConnection | null) ?? null;
}

export async function getConnectionToken(projectId: string): Promise<string> {
  const { data } = await db.from("meta_ad_connections").select("access_token_enc").eq("project_id", projectId).maybeSingle();
  if (!data?.access_token_enc) throw new Error("This project isn't connected to Meta Ads.");
  return decryptToken(data.access_token_enc as string);
}

/** Campaigns of one ad account with their last-30-days totals. */
export async function listCampaigns(token: string, adAccountId: string): Promise<MetaCampaign[]> {
  const [campaigns, insights] = await Promise.all([
    graph<{ data?: Omit<MetaCampaign, "spend" | "impressions" | "reach" | "clicks">[] }>(token, `${adAccountId}/campaigns`, "GET", {
      fields: "id,name,objective,status,effective_status,daily_budget,lifetime_budget",
      limit: "100",
    }),
    graph<{ data?: { campaign_id: string; spend?: string; impressions?: string; reach?: string; clicks?: string }[] }>(token, `${adAccountId}/insights`, "GET", {
      level: "campaign",
      date_preset: "last_30d",
      fields: "campaign_id,spend,impressions,reach,clicks",
      limit: "500",
    }).catch(() => ({ data: [] })),
  ]);
  const byId = new Map((insights.data ?? []).map((r) => [r.campaign_id, r]));
  return (campaigns.data ?? []).map((c) => {
    const r = byId.get(c.id);
    return {
      ...c,
      spend: Number(r?.spend ?? 0),
      impressions: Number(r?.impressions ?? 0),
      reach: Number(r?.reach ?? 0),
      clicks: Number(r?.clicks ?? 0),
    };
  });
}

export async function createPausedCampaign(token: string, adAccountId: string, name: string, objective: string): Promise<string> {
  const base = { name, objective, status: "PAUSED", special_ad_categories: "[]" };
  try {
    const res = await graph<{ id: string }>(token, `${adAccountId}/campaigns`, "POST", base);
    return res.id;
  } catch (error) {
    // Newer Graph versions require stating whether ad sets share a budget
    // when the campaign itself has no budget — retry with that one flag.
    if (error instanceof Error && /budget_sharing/i.test(error.message)) {
      const res = await graph<{ id: string }>(token, `${adAccountId}/campaigns`, "POST", { ...base, is_adset_budget_sharing_enabled: "false" });
      return res.id;
    }
    throw error;
  }
}

export async function setCampaignStatus(token: string, campaignId: string, status: "ACTIVE" | "PAUSED") {
  await graph<{ success: boolean }>(token, campaignId, "POST", { status });
}
