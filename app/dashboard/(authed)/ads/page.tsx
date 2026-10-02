import Image from "next/image";
import { listProjectOptions } from "@/lib/dashboard/projects";
import { formatDate, formatMoney, formatNumber } from "@/lib/dashboard/format";
import { PageHeader, Card, EmptyState, buttonStyles, inputClasses, labelClasses } from "@/components/dashboard/ui";
import { CAMPAIGN_OBJECTIVES, getConnection, getConnectionToken, listCampaigns, type MetaCampaign } from "@/lib/meta-ads-connections";
import { createMetaCampaign, disconnectMetaAds, selectMetaAdAccount, toggleMetaCampaign } from "@/lib/dashboard/actions/meta-ads";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meta Ads" };

const card = "p-5";

function Notice({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  return (
    <div
      className={
        tone === "ok"
          ? "rounded-lg border border-green-600/25 bg-green-500/10 text-green-800 px-4 py-3 text-small mb-6"
          : "rounded-lg border border-red-600/25 bg-red-500/10 text-red-800 px-4 py-3 text-small mb-6"
      }
    >
      {children}
    </div>
  );
}

function budgetLabel(c: MetaCampaign, currency: string) {
  if (c.daily_budget) return `${formatMoney(Number(c.daily_budget) / 100, currency)} / day`;
  if (c.lifetime_budget) return `${formatMoney(Number(c.lifetime_budget) / 100, currency)} lifetime`;
  return "Set on ad sets";
}

export default async function MetaAdsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; connected?: string; created?: string; error?: string; disconnected?: string }>;
}) {
  const params = await searchParams;
  const projects = await listProjectOptions();
  const projectId = params.project && projects.some((p) => p.id === params.project) ? params.project : null;
  const project = projects.find((p) => p.id === projectId) ?? null;
  const conn = projectId ? await getConnection(projectId) : null;
  const account = conn?.ad_accounts.find((a) => a.id === conn.selected_ad_account_id) ?? null;
  const currency = account?.currency ?? "USD";

  let campaigns: MetaCampaign[] = [];
  let loadError: string | null = null;
  if (projectId && conn && account) {
    try {
      campaigns = await listCampaigns(await getConnectionToken(projectId), account.id);
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Couldn't load campaigns.";
    }
  }
  const totals = campaigns.reduce(
    (t, c) => ({ spend: t.spend + c.spend, impressions: t.impressions + c.impressions, reach: t.reach + c.reach, clicks: t.clicks + c.clicks }),
    { spend: 0, impressions: 0, reach: 0, clicks: 0 }
  );

  return (
    <>
      <PageHeader
        title="Meta Ads"
        description="Connect a client's Meta ad account with Facebook Login for Business, then review and manage their Facebook and Instagram campaigns."
      />

      <form method="get" className="flex flex-wrap items-end gap-3 mb-8">
        <div className="min-w-[280px] flex-1 max-w-md">
          <label htmlFor="project" className={labelClasses}>
            Client project
          </label>
          <select id="project" name="project" defaultValue={projectId ?? ""} className={inputClasses}>
            <option value="" disabled>
              Choose a project
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={buttonStyles.secondary}>
          Open
        </button>
      </form>

      {params.connected && <Notice tone="ok">Connected. The ad accounts and Pages you granted are listed below.</Notice>}
      {params.created && <Notice tone="ok">Campaign created. It starts paused, so nothing spends until you turn it on.</Notice>}
      {params.disconnected && <Notice tone="ok">Disconnected. The saved access for this project was deleted.</Notice>}
      {params.error && <Notice tone="error">{params.error.length > 20 ? params.error : "That didn't work. Check the form and try again."}</Notice>}

      {!project ? (
        <EmptyState title="Choose a client project" description="Pick the client whose Meta ads you want to manage." />
      ) : !conn ? (
        <EmptyState
          title={`Connect ${project.name}'s ad account`}
          description="You'll sign in with Facebook and choose which businesses, ad accounts and Pages to share. You can disconnect at any time."
          action={
            <a href={`/api/dashboard/ads/facebook-login/authorize?project_id=${project.id}`} className={buttonStyles.primary}>
              Connect with Facebook
            </a>
          }
        />
      ) : (
        <div className="space-y-6">
          <Card className={card}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-tag font-mono uppercase tracking-widest text-ink-subtle">Connection</p>
                <p className="text-body-lg font-semibold mt-1">Connected by {conn.connected_user_name ?? "Facebook user"}</p>
                <p className="text-small text-ink-muted mt-1">
                  {formatDate(conn.connected_at)} · {conn.ad_accounts.length} ad account{conn.ad_accounts.length === 1 ? "" : "s"} · {conn.pages.length} Page
                  {conn.pages.length === 1 ? "" : "s"} shared
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={`/api/dashboard/ads/facebook-login/authorize?project_id=${project.id}`} className={buttonStyles.secondary}>
                  Reconnect
                </a>
                <form action={disconnectMetaAds}>
                  <input type="hidden" name="project_id" value={project.id} />
                  <button type="submit" className={buttonStyles.danger}>
                    Disconnect
                  </button>
                </form>
              </div>
            </div>

            <form action={selectMetaAdAccount} className="flex flex-wrap items-end gap-3 mt-5">
              <input type="hidden" name="project_id" value={project.id} />
              <div className="min-w-[280px] flex-1 max-w-lg">
                <label htmlFor="ad_account_id" className={labelClasses}>
                  Ad account
                </label>
                <select id="ad_account_id" name="ad_account_id" defaultValue={conn.selected_ad_account_id ?? ""} className={inputClasses}>
                  <option value="" disabled>
                    Choose an ad account
                  </option>
                  {conn.ad_accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.id.replace("act_", "")}){a.business_name ? ` · ${a.business_name}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className={buttonStyles.secondary}>
                Use this account
              </button>
            </form>
          </Card>

          {conn.pages.length > 0 && (
            <Card className={card}>
              <p className="text-tag font-mono uppercase tracking-widest text-ink-subtle mb-4">Facebook Pages shared</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {conn.pages.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg border border-ink/10 bg-white/70 px-3 py-2.5">
                    {p.picture ? (
                      <Image src={p.picture} alt="" width={36} height={36} unoptimized className="rounded-full size-9 object-cover" />
                    ) : (
                      <div className="size-9 rounded-full bg-ink/10" />
                    )}
                    <div className="min-w-0">
                      <p className="text-small font-medium truncate">{p.name}</p>
                      {p.category && <p className="text-tag text-ink-subtle truncate">{p.category}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {!account ? (
            <EmptyState title="Choose an ad account" description="Pick which of the shared ad accounts to manage for this project." />
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Spend · last 30 days", value: formatMoney(totals.spend, currency) },
                  { label: "Impressions", value: formatNumber(totals.impressions) },
                  { label: "Reach", value: formatNumber(totals.reach) },
                  { label: "Clicks", value: formatNumber(totals.clicks) },
                ].map((s) => (
                  <Card key={s.label} className="p-4">
                    <p className="text-small text-ink-muted">{s.label}</p>
                    <p className="text-h3 font-semibold mt-1">{s.value}</p>
                  </Card>
                ))}
              </div>

              <Card className={card}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
                  <p className="text-body-lg font-semibold">Campaigns · {account.name}</p>
                  <p className="text-small text-ink-subtle">Results from the last 30 days</p>
                </div>
                {loadError ? (
                  <p className="text-small text-red-700">{loadError}</p>
                ) : campaigns.length === 0 ? (
                  <p className="text-small text-ink-muted">No campaigns in this ad account yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-small">
                      <thead>
                        <tr className="text-left text-ink-subtle border-b border-ink/10">
                          <th className="py-2 pr-3 font-medium">Campaign</th>
                          <th className="py-2 pr-3 font-medium">Status</th>
                          <th className="py-2 pr-3 font-medium">Budget</th>
                          <th className="py-2 pr-3 font-medium text-right">Spend</th>
                          <th className="py-2 pr-3 font-medium text-right">Impressions</th>
                          <th className="py-2 pr-3 font-medium text-right">Clicks</th>
                          <th className="py-2 font-medium text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaigns.map((c) => (
                          <tr key={c.id} className="border-b border-ink/5 last:border-0">
                            <td className="py-2.5 pr-3">
                              <p className="font-medium">{c.name}</p>
                              <p className="text-tag text-ink-subtle">{c.objective.replace("OUTCOME_", "").toLowerCase()}</p>
                            </td>
                            <td className="py-2.5 pr-3 font-mono text-tag uppercase tracking-widest">{c.effective_status.replace(/_/g, " ").toLowerCase()}</td>
                            <td className="py-2.5 pr-3">{budgetLabel(c, currency)}</td>
                            <td className="py-2.5 pr-3 text-right">{formatMoney(c.spend, currency)}</td>
                            <td className="py-2.5 pr-3 text-right">{formatNumber(c.impressions)}</td>
                            <td className="py-2.5 pr-3 text-right">{formatNumber(c.clicks)}</td>
                            <td className="py-2.5 text-right">
                              {(c.status === "ACTIVE" || c.status === "PAUSED") && (
                                <form action={toggleMetaCampaign}>
                                  <input type="hidden" name="project_id" value={project.id} />
                                  <input type="hidden" name="campaign_id" value={c.id} />
                                  <input type="hidden" name="status" value={c.status === "ACTIVE" ? "PAUSED" : "ACTIVE"} />
                                  <button type="submit" className={buttonStyles.secondary}>
                                    {c.status === "ACTIVE" ? "Pause" : "Turn on"}
                                  </button>
                                </form>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card className={card}>
                <p className="text-body-lg font-semibold">New campaign</p>
                <p className="text-small text-ink-muted mt-1">Created paused in {account.name}. Add ad sets and ads in Ads Manager or here later, then turn it on.</p>
                <form action={createMetaCampaign} className="flex flex-wrap items-end gap-3 mt-4">
                  <input type="hidden" name="project_id" value={project.id} />
                  <div className="min-w-[240px] flex-1">
                    <label htmlFor="name" className={labelClasses}>
                      Campaign name
                    </label>
                    <input id="name" name="name" required maxLength={200} placeholder="Winter room offer" className={inputClasses} />
                  </div>
                  <div className="min-w-[180px]">
                    <label htmlFor="objective" className={labelClasses}>
                      Objective
                    </label>
                    <select id="objective" name="objective" defaultValue="OUTCOME_TRAFFIC" className={inputClasses}>
                      {CAMPAIGN_OBJECTIVES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" className={buttonStyles.primary}>
                    Create paused campaign
                  </button>
                </form>
              </Card>
            </>
          )}
        </div>
      )}
    </>
  );
}
