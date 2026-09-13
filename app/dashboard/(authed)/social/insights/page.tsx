import { listProjectOptions } from "@/lib/dashboard/projects";
import { formatNumber } from "@/lib/dashboard/format";
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
import TopPostsTable from "@/components/dashboard/social/insights/TopPostsTable";
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

function PlatformTag({ platform }: { platform: SocialPlatform }) {
  return (
    <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle border border-ink/15 rounded-full px-2.5 py-1">
      {platform}
    </span>
  );
}

function FacebookBlock({ s, range }: { s: FacebookInsights; range: InsightRange }) {
  const cmp = `vs previous ${range} days`;
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
        <StatTile label="Views" value={s.current.views} previous={s.previous.views} comparisonLabel={cmp} />
        {s.current.viewers != null ? (
          <StatTile label="Viewers" value={s.current.viewers} previous={s.previous.viewers} comparisonLabel={cmp} />
        ) : (
          <StatTile
            label="Avg. daily viewers"
            value={s.current.avgDailyViewers}
            previous={s.previous.avgDailyViewers}
            comparisonLabel={cmp}
          />
        )}
        <StatTile label="Post engagements" value={s.current.engagements} previous={s.previous.engagements} comparisonLabel={cmp} />
        <StatTile label="Page visits" value={s.current.pageVisits} previous={s.previous.pageVisits} comparisonLabel={cmp} />
        <StatTile label="Video views" value={s.current.videoViews} previous={s.previous.videoViews} comparisonLabel={cmp} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TrendChart title="Views per day" description="Times your posts and Page content were shown" points={s.series.views} />
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
            Top posts <span className="font-normal text-ink-subtle">· by views</span>
          </p>
          <TopPostsTable platform="facebook" posts={s.topPosts} />
        </div>
      </div>
    </section>
  );
}

function InstagramBlock({ s, range }: { s: InstagramInsights; range: InsightRange }) {
  const cmp = `vs previous ${range} days`;
  const uniqueNote = "Unique count — Instagram only reports it for 30 days at a time";
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <PlatformTag platform="instagram" />
        <h2 className="text-body-lg font-semibold">{s.username ? `@${s.username}` : s.label}</h2>
        <span className="text-small text-ink-subtle">
          {postCountLabel(s.postCount)} in the last {range} days
        </span>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-4">
        <StatTile label="Followers" value={s.followers} note="Current total" />
        <StatTile
          label="Reach"
          value={s.current.reach}
          previous={s.previous.reach}
          comparisonLabel={cmp}
          note={s.current.reach == null ? uniqueNote : undefined}
        />
        <StatTile label="Views" value={s.current.views} previous={s.previous.views} comparisonLabel={cmp} />
        <StatTile
          label="Accounts engaged"
          value={s.current.accounts_engaged}
          previous={s.previous.accounts_engaged}
          comparisonLabel={cmp}
          note={s.current.accounts_engaged == null ? uniqueNote : undefined}
        />
        <StatTile
          label="Interactions"
          value={s.current.total_interactions}
          previous={s.previous.total_interactions}
          comparisonLabel={cmp}
        />
        <StatTile label="Profile views" value={s.current.profile_views} previous={s.previous.profile_views} comparisonLabel={cmp} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TrendChart title="Reach per day" description="Accounts that saw your content each day" points={s.series.reach} />
        <div className={card}>
          <p className="text-small font-semibold mb-4">Interactions</p>
          <BarList items={s.interactions} emptyText="No interactions in this period." />
        </div>
        <div className={card}>
          <p className="text-small font-semibold mb-4">Profile activity</p>
          <BarList items={s.profileActivity} emptyText="No profile activity in this period." />
        </div>
      </div>

      <div className={card}>
        <p className="text-small font-semibold mb-3">
          Top posts <span className="font-normal text-ink-subtle">· by views</span>
        </p>
        <TopPostsTable platform="instagram" posts={s.topPosts} />
      </div>
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
