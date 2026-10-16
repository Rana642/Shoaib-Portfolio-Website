import Link from "next/link";
import { CheckCircle2, CircleAlert, MessageCircle, ThumbsUp, Eye } from "lucide-react";
import { listProjectOptions } from "@/lib/dashboard/projects";
import { formatDate } from "@/lib/dashboard/format";
import { PageHeader, Card, EmptyState, LinkButton, buttonStyles, inputClasses, labelClasses } from "@/components/dashboard/ui";
import { getFreshYouTubeAccessToken } from "@/lib/social-youtube";
import {
  auditChannel,
  channelDetails,
  growthReport,
  listChannelComments,
  listChannelVideos,
  projectYouTubeAccount,
  videoSeoChecks,
  type ChannelComment,
  type ChannelDetails,
  type ChannelVideo,
  type GrowthReport,
} from "@/lib/youtube-manage";
import { replyYouTubeComment, saveVideoSeo } from "@/lib/dashboard/actions/youtube";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "YouTube" };

type Tab = "overview" | "videos" | "comments" | "audit";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "videos", label: "Videos & SEO" },
  { key: "comments", label: "Comments" },
  { key: "audit", label: "Audit" },
];

function Notice({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 text-small mb-6",
        tone === "ok" ? "border-green-600/25 bg-green-500/10 text-green-800" : "border-red-600/25 bg-red-500/10 text-red-800"
      )}
    >
      {children}
    </div>
  );
}

const n = (v: number) => Math.round(v).toLocaleString();
function change(now: number, before: number) {
  if (!before) return null;
  const pct = ((now - before) / before) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}% vs previous 28 days`;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white/60 px-4 py-3">
      <p className="text-tag uppercase tracking-widest text-ink-subtle">{label}</p>
      <p className="text-h3 font-medium tabular-nums mt-1">{value}</p>
      {sub && <p className="text-tag text-ink-subtle mt-0.5">{sub}</p>}
    </div>
  );
}

/** Daily views as simple bars (scaled to the busiest day). */
function DailyBars({ daily }: { daily: GrowthReport["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => d.views));
  return (
    <div className="flex items-end gap-0.5 h-32" role="img" aria-label="Views per day">
      {daily.map((d) => (
        <div
          key={d.day}
          title={`${d.day}: ${n(d.views)} views, ${d.subscribersNet >= 0 ? "+" : ""}${d.subscribersNet} subscribers`}
          className="flex-1 rounded-t bg-cobalt/60 hover:bg-cobalt"
          style={{ height: `${Math.max(2, (d.views / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function Overview({ report, videos }: { report: GrowthReport; videos: ChannelVideo[] }) {
  const t = report.totals;
  const net = t.subscribersGained - t.subscribersLost;
  const title = new Map(videos.map((v) => [v.id, v.title]));
  const trafficMax = Math.max(1, ...report.traffic.map((s) => s.views));
  return (
    <div className="space-y-6">
      <p className="text-small text-ink-muted">
        {formatDate(report.from)} – {formatDate(report.to)} · YouTube&apos;s numbers run a day or two behind.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Views" value={n(t.views)} sub={change(t.views, report.previous.views)} />
        <Stat label="Watch time" value={`${n(t.watchHours)} h`} sub={change(t.watchHours, report.previous.watchHours)} />
        <Stat label="Subscribers" value={`${net >= 0 ? "+" : ""}${n(net)}`} sub={`${n(t.subscribersGained)} gained · ${n(t.subscribersLost)} lost`} />
        <Stat
          label="Revenue"
          value={report.revenue ? `$${report.revenue.estimated.toFixed(2)}` : "—"}
          sub={report.revenue ? "Estimated, before YouTube's share is settled" : "Not monetized, or revenue access not granted"}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Average view" value={`${Math.floor(t.avgViewSeconds / 60)}:${String(Math.round(t.avgViewSeconds % 60)).padStart(2, "0")}`} />
        <Stat label="Likes" value={n(t.likes)} />
        <Stat label="Comments" value={n(t.comments)} />
        <Stat label="Shares" value={n(t.shares)} />
      </div>
      <Card className="p-5">
        <p className="font-medium mb-3">Views per day</p>
        {report.daily.length ? <DailyBars daily={report.daily} /> : <p className="text-small text-ink-muted">No views in this period.</p>}
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <p className="font-medium mb-3">Where viewers come from</p>
          <ul className="space-y-2">
            {report.traffic.map((s) => (
              <li key={s.source} className="text-small">
                <div className="flex justify-between gap-3">
                  <span>{s.source}</span>
                  <span className="tabular-nums text-ink-muted">{n(s.views)}</span>
                </div>
                <div className="h-1.5 rounded bg-ink/5 mt-1">
                  <div className="h-full rounded bg-forest/70" style={{ width: `${(s.views / trafficMax) * 100}%` }} />
                </div>
              </li>
            ))}
            {report.traffic.length === 0 && <li className="text-small text-ink-muted">No data yet.</li>}
          </ul>
        </Card>
        <Card className="p-5">
          <p className="font-medium mb-3">Top videos</p>
          <ol className="space-y-2">
            {report.topVideos.map((v) => (
              <li key={v.videoId} className="flex justify-between gap-3 text-small">
                <a href={`https://youtu.be/${v.videoId}`} target="_blank" rel="noreferrer" className="truncate hover:underline">
                  {title.get(v.videoId) ?? v.videoId}
                </a>
                <span className="tabular-nums text-ink-muted shrink-0">
                  {n(v.views)} views · {v.watchHours.toFixed(1)} h
                </span>
              </li>
            ))}
            {report.topVideos.length === 0 && <li className="text-small text-ink-muted">No views yet.</li>}
          </ol>
          {report.countries.length > 0 && (
            <p className="text-tag text-ink-subtle mt-4">
              Top countries: {report.countries.map((c) => `${c.country} ${n(c.views)}`).join(" · ")}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

function Videos({ projectId, videos, saved }: { projectId: string; videos: ChannelVideo[]; saved?: string }) {
  if (videos.length === 0) return <EmptyState title="No videos yet" description="Uploads from the Planner (Reels & Shorts, Videos) will show here." />;
  return (
    <div className="space-y-4">
      {videos.map((v) => {
        const tips = videoSeoChecks(v);
        return (
          <Card key={v.id} className="p-5">
            <div id={`v-${v.id}`} className="flex flex-col md:flex-row gap-5 scroll-mt-24">
              <div className="md:w-56 shrink-0 space-y-2">
                {v.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.thumbnail} alt="" className="w-full rounded-lg aspect-video object-cover" />
                )}
                <p className="text-tag text-ink-subtle">
                  {v.isShort ? "Short" : "Video"} · {formatDate(v.publishedAt)} · {v.privacy}
                </p>
                <p className="flex items-center gap-3 text-tag text-ink-muted tabular-nums">
                  <span className="inline-flex items-center gap-1"><Eye className="size-3.5" aria-hidden />{n(v.views)}</span>
                  <span className="inline-flex items-center gap-1"><ThumbsUp className="size-3.5" aria-hidden />{n(v.likes)}</span>
                  <span className="inline-flex items-center gap-1"><MessageCircle className="size-3.5" aria-hidden />{n(v.comments)}</span>
                </p>
                <a href={`https://youtu.be/${v.id}`} target="_blank" rel="noreferrer" className="text-tag underline text-ink-muted">
                  Open on YouTube
                </a>
              </div>
              <form action={saveVideoSeo} className="flex-1 min-w-0 space-y-3">
                <input type="hidden" name="project_id" value={projectId} />
                <input type="hidden" name="video_id" value={v.id} />
                <div>
                  <label className={labelClasses} htmlFor={`t-${v.id}`}>Title</label>
                  <input id={`t-${v.id}`} name="title" defaultValue={v.title} maxLength={100} required className={inputClasses} />
                </div>
                <div>
                  <label className={labelClasses} htmlFor={`d-${v.id}`}>Description</label>
                  <textarea id={`d-${v.id}`} name="description" defaultValue={v.description} rows={4} maxLength={5000} className={inputClasses} />
                </div>
                <div>
                  <label className={labelClasses} htmlFor={`g-${v.id}`}>Tags (comma separated)</label>
                  <input id={`g-${v.id}`} name="tags" defaultValue={v.tags.join(", ")} className={inputClasses} />
                </div>
                {tips.length > 0 ? (
                  <ul className="space-y-1">
                    {tips.map((tip) => (
                      <li key={tip} className="flex gap-2 text-tag text-ink-muted">
                        <CircleAlert className="size-3.5 shrink-0 text-orange-600 mt-0.5" aria-hidden />
                        {tip}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="flex gap-2 text-tag text-green-700">
                    <CheckCircle2 className="size-3.5 mt-0.5" aria-hidden /> SEO basics look good.
                  </p>
                )}
                <div className="flex items-center gap-3">
                  <button type="submit" className={buttonStyles.primary}>Save to YouTube</button>
                  {saved === v.id && <span className="text-small text-green-700">Saved.</span>}
                </div>
              </form>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function Comments({ projectId, all, videos, showAll }: { projectId: string; all: ChannelComment[]; videos: ChannelVideo[]; showAll: boolean }) {
  const shown = showAll ? all : all.filter((c) => !c.answered);
  const title = new Map(videos.map((v) => [v.id, v.title]));
  const base = `/dashboard/youtube?project=${projectId}&tab=comments`;
  return (
    <div className="space-y-4">
      <div className="flex gap-2 text-small">
        <Link href={base} className={cn("rounded-full border px-3 py-1", !showAll ? "bg-ink text-cloud border-ink" : "border-ink/15")}>
          Not answered ({all.filter((c) => !c.answered).length})
        </Link>
        <Link href={`${base}&filter=all`} className={cn("rounded-full border px-3 py-1", showAll ? "bg-ink text-cloud border-ink" : "border-ink/15")}>
          All latest ({all.length})
        </Link>
      </div>
      {shown.length === 0 && <EmptyState title="Nothing to answer" description="Every recent comment has a reply from the channel." />}
      {shown.map((c) => (
        <Card key={c.threadId} className="p-5 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium">{c.author}</p>
            <p className="text-tag text-ink-subtle">
              {formatDate(c.publishedAt)} · on{" "}
              <a href={`https://youtu.be/${c.videoId}`} target="_blank" rel="noreferrer" className="underline">
                {title.get(c.videoId) ?? "a video"}
              </a>
            </p>
          </div>
          <p className="text-small whitespace-pre-line">{c.text}</p>
          {c.replies.length > 0 && (
            <ul className="border-l-2 border-ink/10 pl-3 space-y-1">
              {c.replies.map((r, i) => (
                <li key={i} className="text-tag text-ink-muted">
                  <span className={cn("font-medium", r.byChannel && "text-ink")}>{r.byChannel ? "You" : r.author}:</span> {r.text}
                </li>
              ))}
            </ul>
          )}
          <form action={replyYouTubeComment} className="flex flex-col sm:flex-row gap-2">
            <input type="hidden" name="project_id" value={projectId} />
            <input type="hidden" name="comment_id" value={c.commentId} />
            {showAll && <input type="hidden" name="filter" value="all" />}
            <textarea name="text" rows={2} required placeholder="Reply as the channel…" className={cn(inputClasses, "flex-1")} />
            <button type="submit" className={cn(buttonStyles.secondary, "self-end")}>Reply</button>
          </form>
        </Card>
      ))}
    </div>
  );
}

function Audit({ channel, videos }: { channel: ChannelDetails; videos: ChannelVideo[] }) {
  const { score, items } = auditChannel(channel, videos);
  return (
    <div className="space-y-4">
      <Card className="p-5 flex flex-wrap items-center gap-6">
        <div>
          <p className="text-tag uppercase tracking-widest text-ink-subtle">Channel score</p>
          <p className="text-h2 font-medium tabular-nums">{score}/100</p>
        </div>
        <p className="text-small text-ink-muted max-w-xl">
          Based on the channel settings and the latest {videos.length} uploads. Fix the red items first — titles, descriptions and tags can be edited on the Videos & SEO tab.
        </p>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((i) => (
          <Card key={i.area} className="p-4 space-y-1.5">
            <p className="flex items-center gap-2 font-medium">
              {i.ok ? <CheckCircle2 className="size-4 text-green-700" aria-hidden /> : <CircleAlert className="size-4 text-red-600" aria-hidden />}
              {i.area}
            </p>
            <p className="text-small text-ink-muted">{i.finding}</p>
            {!i.ok && <p className="text-small">{i.fix}</p>}
          </Card>
        ))}
      </div>
    </div>
  );
}

export default async function YouTubePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; tab?: string; saved?: string; replied?: string; error?: string; filter?: string }>;
}) {
  const params = await searchParams;
  const projects = await listProjectOptions();
  const projectId = params.project && projects.some((p) => p.id === params.project) ? params.project : null;
  const project = projects.find((p) => p.id === projectId) ?? null;
  const tab: Tab = TABS.some((t) => t.key === params.tab) ? (params.tab as Tab) : "overview";
  const account = projectId ? await projectYouTubeAccount(projectId) : null;

  // Load first, render after — so a YouTube error shows as a notice.
  let loadError: string | null = null;
  let channel: ChannelDetails | null = null;
  let videos: ChannelVideo[] = [];
  let report: GrowthReport | null = null;
  let comments: ChannelComment[] = [];
  if (projectId && account) {
    try {
      const token = await getFreshYouTubeAccessToken(account);
      channel = await channelDetails(token, account.external_id);
      videos = channel.uploadsPlaylist ? await listChannelVideos(token, channel.uploadsPlaylist, 50) : [];
      if (tab === "overview") report = await growthReport(token, 28);
      if (tab === "comments") comments = await listChannelComments(token, channel.id, 100);
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Couldn't load the channel.";
    }
  }
  const body =
    !projectId || !channel
      ? null
      : tab === "overview"
        ? report && <Overview report={report} videos={videos} />
        : tab === "videos"
          ? <Videos projectId={projectId} videos={videos} saved={params.saved} />
          : tab === "comments"
            ? <Comments projectId={projectId} all={comments} videos={videos} showAll={params.filter === "all"} />
            : <Audit channel={channel} videos={videos} />;

  return (
    <>
      <PageHeader
        title="YouTube"
        description="Growth and revenue report, video SEO, comment replies and a channel audit for each client's connected channel."
      />
      <form method="get" className="flex flex-wrap items-end gap-3 mb-6">
        <div className="min-w-[280px] flex-1 max-w-md">
          <label htmlFor="project" className={labelClasses}>Client project</label>
          <select id="project" name="project" defaultValue={projectId ?? ""} className={inputClasses}>
            <option value="" disabled>Choose a project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>
        <input type="hidden" name="tab" value={tab} />
        <button type="submit" className={buttonStyles.secondary}>Open</button>
      </form>

      {params.replied && <Notice tone="ok">Reply posted on YouTube.</Notice>}
      {params.saved && !params.error && <Notice tone="ok">Video updated on YouTube.</Notice>}
      {params.error && <Notice tone="error">{params.error}</Notice>}

      {!project ? (
        <EmptyState title="Choose a client project" description="Pick the client whose YouTube channel you want to manage." />
      ) : !account ? (
        <EmptyState
          title={`Connect ${project.name}'s YouTube channel`}
          description="Sign in with the Google account (or Brand Account) that owns the channel. Until Google verifies the app you'll see an 'unverified app' screen — choose Advanced → Go to Socially Snap."
          action={<LinkButton href={`/api/dashboard/social/youtube/authorize?project_id=${project.id}`}>Connect YouTube</LinkButton>}
        />
      ) : (
        <>
          {channel && (
            <div className="flex flex-wrap items-center gap-4 mb-6">
              {channel.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={channel.thumbnail} alt="" className="size-12 rounded-full" />
              )}
              <div>
                <p className="font-medium">{channel.title}</p>
                <p className="text-tag text-ink-subtle tabular-nums">
                  {channel.customUrl ?? ""} · {channel.subscribers != null ? `${n(channel.subscribers)} subscribers · ` : ""}
                  {n(channel.videos)} videos · {n(channel.views)} views
                </p>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-1 border-b border-ink/10 mb-6" role="tablist">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={`/dashboard/youtube?project=${project.id}&tab=${t.key}`}
                role="tab"
                aria-selected={tab === t.key}
                className={cn(
                  "px-3 py-2 -mb-px border-b-2 text-small font-medium",
                  tab === t.key ? "border-citrus text-ink" : "border-transparent text-ink-muted hover:text-ink"
                )}
              >
                {t.label}
              </Link>
            ))}
          </div>
          {loadError ? (
            <Notice tone="error">
              {loadError}{" "}
              <Link href={`/api/dashboard/social/youtube/authorize?project_id=${project.id}`} className="underline">
                Reconnect YouTube
              </Link>
            </Notice>
          ) : (
            body
          )}
        </>
      )}
    </>
  );
}
