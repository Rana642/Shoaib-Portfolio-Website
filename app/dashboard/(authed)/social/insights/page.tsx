import { listProjectOptions } from "@/lib/dashboard/projects";
import { formatCompact, formatNumber } from "@/lib/dashboard/format";
import {
  getProjectInsights,
  type FacebookInsights,
  type InstagramInsights,
  type InsightsError,
} from "@/lib/social-insights";
import { parseInsightRange, type InsightRange } from "@/lib/social-insights-shared";
import { PageHeader, EmptyState, LinkButton } from "@/components/dashboard/ui";
import InsightsShell from "@/components/dashboard/social/insights/InsightsShell";
import StatTile from "@/components/dashboard/social/insights/StatTile";
import TrendChart from "@/components/dashboard/social/insights/TrendChart";
import BarList from "@/components/dashboard/social/insights/BarList";
import TopPostsTable, { FORMAT_LABEL } from "@/components/dashboard/social/insights/TopPostsTable";
import PostingTimesPanel from "@/components/dashboard/social/insights/PostingTimesPanel";
import type { SocialPlatform } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Insights" };

const card = "bg-white border border-ink/10 rounded-xl p-5";

function signed(n: number): string {
  return n > 0 ? `+${formatNumber(n)}` : formatNumber(n);
}

function postCountLabel(n: number): string {
  if (n >= 100) return "100+ posts";
  return `${n} post${n === 1 ? "" : "s"}`;
}

/** "+80.9K more from ads" under an organic figure; nothing when there were no ads. */
function fromAds(n: number | null | undefined): string | undefined {
  return n ? `+${formatCompact(n)} more from ads` : undefined;
}

/** What the paid side added in the period, beside the organic tiles above. */
function AdsCard({
  range,
  items,
}: {
  range: InsightRange;
  items: { label: string; ads: number | null; organic: number | null }[];
}) {
  const shown = items.filter((i) => (i.ads ?? 0) > 0);
  if (shown.length === 0) return null;
  return (
    <div className={card}>
      <p className="text-small font-semibold">
        From ads <span className="font-normal text-ink-subtle">· paid, last {range} days · kept out of the figures above</span>
      </p>
      <dl className="mt-4 grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-4">
        {shown.map((i) => {
          const all = (i.ads ?? 0) + (i.organic ?? 0);
          return (
            <div key={i.label}>
              <dt className="text-tag text-ink-subtle">{i.label}</dt>
              <dd className="text-body-lg font-semibold tabular-nums">{formatNumber(i.ads)}</dd>
              {i.organic != null && all > 0 && (
                <dd className="text-tag text-ink-subtle">{Math.round(((i.ads ?? 0) / all) * 100)}% of all</dd>
              )}
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function PlatformTag({ platform }: { platform: SocialPlatform }) {
  return (
    <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle border border-ink/15 rounded-full px-2.5 py-1">
      {platform}
    </span>
  );
}

function FacebookBlock({ s, range }: { s: FacebookInsights; range: InsightRange }) {
  const cmp = `vs previous ${range} days`;
  const split = s.current.adViews != null;
  const hadAds = Boolean(s.current.adViews || s.current.adVideoViews);
  const inclAds = hadAds ? "Includes ads" : undefined;
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <PlatformTag platform="facebook" />
        <h2 className="text-body-lg font-semibold">{s.label}</h2>
        <span className="text-small text-ink-subtle">
          {postCountLabel(s.postCount)} in the last {range} days
        </span>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-4">
        <StatTile label="Followers" value={s.followers} note={`${signed(s.current.netFollows)} net in ${range} days`} />
        <StatTile
          label={split ? "Organic views" : "Views"}
          value={s.current.views}
          previous={s.previous.views}
          comparisonLabel={cmp}
          extra={fromAds(s.current.adViews)}
        />
        {s.current.viewers != null ? (
          <StatTile label="Viewers" value={s.current.viewers} previous={s.previous.viewers} comparisonLabel={cmp} extra={inclAds} />
        ) : (
          <StatTile
            label="Avg. daily viewers"
            value={s.current.avgDailyViewers}
            previous={s.previous.avgDailyViewers}
            comparisonLabel={cmp}
            extra={inclAds}
          />
        )}
        <StatTile
          label="Post engagements"
          value={s.current.engagements}
          previous={s.previous.engagements}
          comparisonLabel={cmp}
          extra={inclAds}
        />
        <StatTile label="Page visits" value={s.current.pageVisits} previous={s.previous.pageVisits} comparisonLabel={cmp} extra={inclAds} />
        <StatTile
          label={s.current.adVideoViews != null ? "Organic video views" : "Video views"}
          value={s.current.videoViews}
          previous={s.previous.videoViews}
          comparisonLabel={cmp}
          extra={fromAds(s.current.adVideoViews)}
        />
      </div>

      <AdsCard
        range={range}
        items={[
          { label: "Views", ads: s.current.adViews, organic: s.current.views },
          { label: "Video views (3 s+)", ads: s.current.adVideoViews, organic: s.current.videoViews },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TrendChart
          title={split ? "Organic views per day" : "Views per day"}
          description={split ? "Times your posts and Page content were shown, ads left out" : "Times your posts and Page content were shown"}
          points={s.series.views}
        />
        <TrendChart
          title="Post engagements per day"
          description="Reactions, comments, shares and clicks"
          points={s.series.engagements}
        />
        <TrendChart title="Followers" description="Total Page followers each day" points={s.series.followers} zeroBaseline={false} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={card}>
          <p className="text-small font-semibold mb-4">Reactions</p>
          <BarList items={s.reactions} emptyText="No reactions in this period." />
        </div>
        <div className={`${card} lg:col-span-2`}>
          <p className="text-small font-semibold mb-3">
            Top posts{" "}
            <span className="font-normal text-ink-subtle">
              · by {s.topPosts.some((p) => p.adViews != null) ? "organic " : ""}views
            </span>
          </p>
          <TopPostsTable platform="facebook" posts={s.topPosts} />
        </div>
      </div>

      <PostingTimesPanel analysis={s.postingTimes} />
    </section>
  );
}

function InstagramBlock({ s, range }: { s: InstagramInsights; range: InsightRange }) {
  const cmp = `vs previous ${range} days`;
  const uniqueNote = "Unique count — Instagram only reports it for 30 days at a time";
  const a = s.ads;
  const hadAds = Boolean(a && (a.views || a.reach || a.total_interactions));
  const inclAds = hadAds ? "Includes ads" : undefined;
  const organic = (label: string) => (a ? `Organic ${label.toLowerCase()}` : label);
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <PlatformTag platform="instagram" />
        <h2 className="text-body-lg font-semibold">{s.username ? `@${s.username}` : s.label}</h2>
        <span className="text-small text-ink-subtle">
          {postCountLabel(s.postCount)} in the last {range} days
        </span>
      </header>

      {s.insightsError && (
        <div className="bg-white border border-citrus/60 rounded-xl p-4">
          <p className="text-small font-medium">Reach, views and profile activity aren&apos;t available for this account yet.</p>
          <p className="text-tag text-ink-subtle mt-1">
            Meta said: {s.insightsError}. Reconnect the Facebook Page from Connections (the connection now also asks for
            Instagram insights). Followers and each post&apos;s likes and comments below are live.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-4">
        <StatTile label="Followers" value={s.followers} note="Current total" />
        <StatTile
          label={organic("Reach")}
          value={s.current.reach}
          previous={s.previous.reach}
          comparisonLabel={cmp}
          note={s.current.reach == null ? uniqueNote : undefined}
          extra={a?.reach ? `At least · ${formatCompact(a.reach)} reached by ads` : undefined}
        />
        <StatTile
          label={organic("Views")}
          value={s.current.views}
          previous={s.previous.views}
          comparisonLabel={cmp}
          extra={fromAds(a?.views)}
        />
        <StatTile
          label="Accounts engaged"
          value={s.current.accounts_engaged}
          previous={s.previous.accounts_engaged}
          comparisonLabel={cmp}
          note={s.current.accounts_engaged == null ? uniqueNote : undefined}
          extra={inclAds}
        />
        <StatTile
          label={organic("Interactions")}
          value={s.current.total_interactions}
          previous={s.previous.total_interactions}
          comparisonLabel={cmp}
          extra={fromAds(a?.total_interactions)}
        />
        <StatTile
          label="Profile views"
          value={s.current.profile_views}
          previous={s.previous.profile_views}
          comparisonLabel={cmp}
          extra={inclAds}
        />
      </div>

      {a && (
        <AdsCard
          range={range}
          items={[
            { label: "Views", ads: a.views, organic: s.current.views },
            { label: "Accounts reached", ads: a.reach, organic: null },
            { label: "Interactions", ads: a.total_interactions, organic: s.current.total_interactions },
            { label: "Likes", ads: a.likes, organic: s.current.likes },
            { label: "Comments", ads: a.comments, organic: s.current.comments },
            { label: "Saves", ads: a.saves, organic: s.current.saves },
          ]}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TrendChart
          title="Reach per day"
          description={hadAds ? "Accounts that saw your content each day, ads included" : "Accounts that saw your content each day"}
          points={s.series.reach}
        />
        <div className={card}>
          <p className="text-small font-semibold mb-4">
            Interactions {a && <span className="font-normal text-ink-subtle">· organic</span>}
          </p>
          <BarList items={s.interactions} emptyText="No interactions in this period." />
        </div>
        <div className={card}>
          <p className="text-small font-semibold mb-4">
            Profile activity {hadAds && <span className="font-normal text-ink-subtle">· includes ads</span>}
          </p>
          <BarList items={s.profileActivity} emptyText="No profile activity in this period." />
        </div>
      </div>

      <div className={card}>
        <p className="text-small font-semibold mb-3">
          Top posts <span className="font-normal text-ink-subtle">· by views · organic only (Meta leaves ads out of post figures)</span>
        </p>
        <TopPostsTable platform="instagram" posts={s.topPosts} />
      </div>

      {s.audience && s.audience.total > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className={card}>
            <p className="text-small font-semibold mb-4">
              Followers by country <span className="font-normal text-ink-subtle">· top 10</span>
            </p>
            <BarList items={s.audience.country} />
          </div>
          <div className={card}>
            <p className="text-small font-semibold mb-4">
              Followers by city <span className="font-normal text-ink-subtle">· top 10</span>
            </p>
            <BarList items={s.audience.city} />
          </div>
          <div className={card}>
            <p className="text-small font-semibold mb-4">Followers by age and gender</p>
            <BarList items={s.audience.gender} />
            <div className="mt-5">
              <BarList items={s.audience.age} />
            </div>
          </div>
        </div>
      )}

      {s.formats.length > 0 && (
        <div className={card}>
          <p className="text-small font-semibold mb-3">
            By format <span className="font-normal text-ink-subtle">· every post in the last {range} days</span>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-small">
              <thead>
                <tr className="border-b border-ink/10 text-ink-subtle">
                  <th className="text-left font-medium py-2">Format</th>
                  <th className="text-right font-medium py-2 px-2">Posts</th>
                  <th className="text-right font-medium py-2 px-2">Avg. likes</th>
                  <th className="text-right font-medium py-2 px-2">Avg. comments</th>
                  {!s.insightsError && <th className="text-right font-medium py-2 pl-2">Avg. views</th>}
                </tr>
              </thead>
              <tbody>
                {s.formats.map((f) => (
                  <tr key={f.format} className="border-b border-ink/5 last:border-0">
                    <td className="py-2">{FORMAT_LABEL[f.format]}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{f.posts}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{formatNumber(f.avgLikes)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{formatNumber(f.avgComments)}</td>
                    {!s.insightsError && <td className="py-2 pl-2 text-right tabular-nums">{formatNumber(f.avgViews)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <PostingTimesPanel analysis={s.postingTimes} />
    </section>
  );
}

function ErrorBlock({ s }: { s: InsightsError }) {
  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-center gap-3">
        <PlatformTag platform={s.platform} />
        <h2 className="text-body-lg font-semibold">{s.label}</h2>
      </header>
      <div className="bg-white border border-red-600/20 rounded-xl p-5">
        <p className="text-small text-red-700">Couldn&apos;t load insights: {s.error}</p>
        <p className="text-tag text-ink-subtle mt-1">If this keeps happening, reconnect the account from Connections.</p>
      </div>
    </section>
  );
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; range?: string }>;
}) {
  const { project: projectParam, range: rangeParam } = await searchParams;
  const projects = await listProjectOptions();

  if (projects.length === 0) {
    return (
      <>
        <PageHeader title="Insights" description="How each connected Page and Instagram account is performing." />
        <EmptyState
          title="No projects yet"
          description="Every client needs at least one project before its social accounts can be connected."
          action={<LinkButton href="/dashboard/clients">Go to Clients</LinkButton>}
        />
      </>
    );
  }

  const projectId = projects.some((p) => p.id === projectParam) ? projectParam! : projects[0].id;
  const range = parseInsightRange(rangeParam);
  const sections = await getProjectInsights(projectId, range);

  return (
    <>
      <PageHeader
        title="Insights"
        description="Views, reach, engagement, follower growth and top posts for each connected Facebook Page and Instagram account."
      />
      <InsightsShell projects={projects} projectId={projectId} range={range}>
        {sections.length === 0 ? (
          <EmptyState
            title="No Facebook or Instagram account on this project"
            description="Map a Page (and its linked Instagram) to this project on the Connections page first."
            action={<LinkButton href="/dashboard/social">Go to Connections</LinkButton>}
          />
        ) : (
          <div className="space-y-14">
            {sections.map((s, i) =>
              "error" in s ? (
                <ErrorBlock key={i} s={s} />
              ) : s.platform === "facebook" ? (
                <FacebookBlock key={i} s={s} range={range} />
              ) : (
                <InstagramBlock key={i} s={s} range={range} />
              )
            )}
          </div>
        )}
        <p className="text-tag text-ink-subtle mt-12">
          From Meta&apos;s Graph API, refreshed at most every 30 minutes. Meta itself reports most figures with up to a
          day&apos;s delay, so today is usually partial.
        </p>
      </InsightsShell>
    </>
  );
}
