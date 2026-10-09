import Link from "next/link";
import { Star } from "lucide-react";
import { listProjectOptions } from "@/lib/dashboard/projects";
import { formatDate } from "@/lib/dashboard/format";
import { PageHeader, Card, EmptyState, buttonStyles, inputClasses, labelClasses } from "@/components/dashboard/ui";
import { STARS, existingGrants, findLocation, gbpAccessToken, getGbpConnection, listReviews, type GbpReview } from "@/lib/gbp";
import { deleteGbpReply, disconnectGbp, linkAllGbpProjects, linkGbpFromExisting, replyGbpReview, selectGbpLocation, skipQueuedReply, updateQueuedReply } from "@/lib/dashboard/actions/gbp";
import { HUMAN_HOURS_PKT, HUMAN_MIN_GAP_MINUTES, HUMAN_GAP_JITTER_MINUTES, HUMAN_MAX_REPLIES_PER_DAY, listQueuedReplies, replyQueueStats, type QueuedReply } from "@/lib/gbp-replies";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Google Business" };

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

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${n} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn("size-3.5", i <= n ? "fill-citrus text-citrus" : "text-ink/20")} aria-hidden />
      ))}
    </span>
  );
}

export default async function GbpPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; connected?: string; replied?: string; reply_deleted?: string; disconnected?: string; error?: string; filter?: string; linked?: string; pick?: string; queue_saved?: string }>;
}) {
  const params = await searchParams;
  const projects = await listProjectOptions();
  const projectId = params.project && projects.some((p) => p.id === params.project) ? params.project : null;
  const project = projects.find((p) => p.id === projectId) ?? null;
  const conn = projectId ? await getGbpConnection(projectId) : null;
  const location = conn ? findLocation(conn) : null;
  const unrepliedOnly = params.filter === "unreplied";
  const grants = project && !conn ? await existingGrants() : [];

  let reviews: GbpReview[] = [];
  let summary: { averageRating: number | null; total: number } = { averageRating: null, total: 0 };
  let loadError: string | null = null;
  if (projectId && location) {
    try {
      const res = await listReviews(await gbpAccessToken(projectId), location);
      reviews = res.reviews;
      summary = { averageRating: res.averageRating, total: res.total };
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Couldn't load reviews.";
    }
  }
  // The reply queue (lib/gbp-replies.ts) — missing until its SQL has run.
  let queue: { stats: Awaited<ReturnType<typeof replyQueueStats>>; waiting: QueuedReply[]; failed: QueuedReply[] } | null = null;
  if (projectId && location) {
    try {
      const [stats, waiting, failed] = await Promise.all([
        replyQueueStats(projectId),
        listQueuedReplies({ projectId, status: "approved", limit: 10 }),
        listQueuedReplies({ projectId, status: "failed", limit: 10 }),
      ]);
      queue = { stats, waiting, failed };
    } catch {
      queue = null;
    }
  }
  const unrepliedCount = reviews.filter((r) => !r.reviewReply).length;
  const shown = unrepliedOnly ? reviews.filter((r) => !r.reviewReply) : reviews;
  const base = `/dashboard/gbp?project=${projectId}`;

  return (
    <>
      <PageHeader
        title="Google Business"
        description="Connect a client's Google Business Profile (through Socially Snap), then read and reply to their reviews."
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

      {params.connected && (
        <Notice tone="ok">
          {params.pick
            ? "Connected. No location is clearly named after this project — choose it below."
            : "Connected. The Business Profile locations this Google account manages are listed below."}
        </Notice>
      )}
      {params.linked !== undefined && (
        <Notice tone="ok">
          {Number(params.linked) > 0
            ? `Linked ${params.linked} more project${params.linked === "1" ? "" : "s"} to their matching Business Profile location.`
            : "No other project has a clearly matching location — connect those one by one."}
        </Notice>
      )}
      {params.replied && <Notice tone="ok">Reply posted. It shows on Google under the review.</Notice>}
      {params.reply_deleted && <Notice tone="ok">Reply deleted from Google.</Notice>}
      {params.queue_saved && <Notice tone="ok">Reply queue updated.</Notice>}
      {params.disconnected && <Notice tone="ok">Disconnected. The saved access for this project was deleted.</Notice>}
      {params.error && <Notice tone="error">{params.error.length > 20 ? params.error : "That didn't work. Check the form and try again."}</Notice>}

      {!project ? (
        <EmptyState title="Choose a client project" description="Pick the client whose Google Business Profile you want to manage." />
      ) : !conn ? (
        <EmptyState
          title={`Connect ${project.name}'s Business Profile`}
          description="Sign in with the Google account that owns or manages the Business Profile and allow Socially Snap to manage it. You can disconnect at any time."
          action={
            <div className="flex flex-col items-center gap-3">
              {grants.map((g) => (
                <form key={g.sourceProjectId} action={linkGbpFromExisting}>
                  <input type="hidden" name="project_id" value={project.id} />
                  <input type="hidden" name="source_project_id" value={g.sourceProjectId} />
                  <button type="submit" className={buttonStyles.primary}>
                    Use {g.email ?? "the connected Google account"} ({g.locations} locations)
                  </button>
                </form>
              ))}
              {grants.length > 0 && (
                <form action={linkAllGbpProjects}>
                  <input type="hidden" name="project_id" value={project.id} />
                  <button type="submit" className={buttonStyles.secondary}>
                    Link every project with a matching location
                  </button>
                </form>
              )}
              <a href={`/api/dashboard/gbp/authorize?project_id=${project.id}`} className={grants.length ? "text-small text-ink-muted underline hover:text-ink" : buttonStyles.primary}>
                {grants.length ? "Or sign in with a different Google account" : "Connect with Google"}
              </a>
            </div>
          }
        />
      ) : (
        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-tag font-mono uppercase tracking-widest text-ink-subtle">Connection</p>
                <p className="text-body-lg font-semibold mt-1">Connected by {conn.connected_email ?? "a Google account"}</p>
                <p className="text-small text-ink-muted mt-1">
                  {formatDate(conn.connected_at)} · {conn.locations.length} location{conn.locations.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={`/api/dashboard/gbp/authorize?project_id=${project.id}`} className={buttonStyles.secondary}>
                  Reconnect
                </a>
                <form action={disconnectGbp}>
                  <input type="hidden" name="project_id" value={project.id} />
                  <button type="submit" className={buttonStyles.danger}>
                    Disconnect
                  </button>
                </form>
              </div>
            </div>

            {conn.locations.length === 0 ? (
              <p className="text-small text-ink-muted mt-5">This Google account doesn&apos;t manage any Business Profile locations. Reconnect with the account that does.</p>
            ) : (
              <form action={selectGbpLocation} className="flex flex-wrap items-end gap-3 mt-5">
                <input type="hidden" name="project_id" value={project.id} />
                <div className="min-w-[280px] flex-1 max-w-lg">
                  <label htmlFor="location" className={labelClasses}>
                    Location
                  </label>
                  <select id="location" name="location" defaultValue={conn.selected_location ?? ""} className={inputClasses}>
                    <option value="" disabled>
                      Choose a location
                    </option>
                    {conn.locations.map((l) => (
                      <option key={l.name} value={l.name}>
                        {l.title}
                        {l.address ? ` · ${l.address}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className={buttonStyles.secondary}>
                  Use this location
                </button>
              </form>
            )}
          </Card>

          {!location ? (
            conn.locations.length > 0 && <EmptyState title="Choose a location" description="Pick which Business Profile to work on for this project." />
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <Card className="p-4">
                  <p className="text-small text-ink-muted">Average rating</p>
                  <p className="text-h3 font-semibold mt-1">{summary.averageRating ? summary.averageRating.toFixed(1) : "—"}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-small text-ink-muted">Reviews</p>
                  <p className="text-h3 font-semibold mt-1">{summary.total}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-small text-ink-muted">Waiting for a reply (latest {reviews.length})</p>
                  <p className="text-h3 font-semibold mt-1">{unrepliedCount}</p>
                </Card>
              </div>

              <Card className="p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-body-lg font-semibold">Reply queue</p>
                  <p className="text-small text-ink-muted">
                    Sent one at a time, {HUMAN_HOURS_PKT.from}:00–{HUMAN_HOURS_PKT.to}:00 PKT, {HUMAN_MIN_GAP_MINUTES}–{HUMAN_MIN_GAP_MINUTES + HUMAN_GAP_JITTER_MINUTES} minutes apart, at most {HUMAN_MAX_REPLIES_PER_DAY} a day, complaints first.
                  </p>
                </div>
                {!queue ? (
                  <p className="text-small text-ink-muted mt-3">
                    The reply queue needs a one-time database update — run the “Google Business review replies” section (gbp_reply_queue) of supabase/dashboard-schema.sql in the
                    Supabase SQL Editor.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                      {[
                        ["Waiting", queue.stats.approved],
                        ["Sent (24 h)", queue.stats.sentLast24h],
                        ["Sent in total", queue.stats.sent],
                        ["Skipped / failed", queue.stats.skipped + queue.stats.failed],
                      ].map(([label, n]) => (
                        <div key={label} className="rounded-lg border border-ink/10 px-3 py-2">
                          <p className="text-tag text-ink-subtle">{label}</p>
                          <p className="text-body-lg font-semibold">{n}</p>
                        </div>
                      ))}
                    </div>
                    {[...queue.failed, ...queue.waiting].length === 0 ? (
                      <p className="text-small text-ink-muted mt-4">Nothing waiting. Ask Claude to write replies and queue them (gbp_queue_replies).</p>
                    ) : (
                      <ul className="divide-y divide-ink/10 mt-4">
                        {[...queue.failed, ...queue.waiting].map((q) => (
                          <li key={q.id} className="py-3">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span className="font-medium">{q.reviewer ?? "Google user"}</span>
                              {q.stars ? <Stars n={q.stars} /> : null}
                              {q.review_created_at && <span className="text-tag text-ink-subtle">{formatDate(q.review_created_at)}</span>}
                              {q.status === "failed" && <span className="text-tag text-red-700">Failed: {q.last_error}</span>}
                            </div>
                            {q.review_comment && <p className="text-small text-ink-muted mt-1 line-clamp-2">{q.review_comment}</p>}
                            <form action={updateQueuedReply} className="mt-2 space-y-2">
                              <input type="hidden" name="project_id" value={project.id} />
                              <input type="hidden" name="id" value={q.id} />
                              <textarea name="reply" rows={3} maxLength={4096} required defaultValue={q.reply} className={inputClasses} />
                              <div className="flex flex-wrap gap-2">
                                <button type="submit" className={buttonStyles.secondary}>
                                  {q.status === "failed" ? "Save and retry" : "Save reply"}
                                </button>
                                <button type="submit" formAction={skipQueuedReply} className={buttonStyles.danger}>
                                  Don&apos;t send
                                </button>
                              </div>
                            </form>
                          </li>
                        ))}
                      </ul>
                    )}
                    {queue.stats.approved > queue.waiting.length && (
                      <p className="text-small text-ink-subtle mt-2">
                        Showing the newest {queue.waiting.length} of {queue.stats.approved} waiting.
                      </p>
                    )}
                  </>
                )}
              </Card>

              <Card className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <p className="text-body-lg font-semibold">Reviews · {location.title}</p>
                  <div className="flex items-center gap-1 rounded-lg border border-ink/15 p-1">
                    <Link href={base} className={cn("px-3 py-1.5 rounded-md text-small font-medium", !unrepliedOnly ? "bg-citrus text-ink" : "text-ink-muted hover:text-ink")}>
                      All
                    </Link>
                    <Link
                      href={`${base}&filter=unreplied`}
                      className={cn("px-3 py-1.5 rounded-md text-small font-medium", unrepliedOnly ? "bg-citrus text-ink" : "text-ink-muted hover:text-ink")}
                    >
                      Needs reply
                    </Link>
                  </div>
                </div>

                {loadError ? (
                  <p className="text-small text-red-700">{loadError}</p>
                ) : shown.length === 0 ? (
                  <p className="text-small text-ink-muted">{unrepliedOnly ? "Every recent review has a reply." : "No reviews yet."}</p>
                ) : (
                  <ul className="divide-y divide-ink/10">
                    {shown.map((r) => (
                      <li key={r.reviewId} className="py-4">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-medium">{r.reviewer.isAnonymous ? "Anonymous" : r.reviewer.displayName ?? "Google user"}</span>
                          <Stars n={STARS[r.starRating] ?? 0} />
                          <span className="text-tag text-ink-subtle">{formatDate(r.createTime)}</span>
                        </div>
                        {r.comment ? (
                          <p className="text-small text-ink mt-2 whitespace-pre-line">{r.comment}</p>
                        ) : (
                          <p className="text-small text-ink-subtle mt-2 italic">Rating only, no comment.</p>
                        )}

                        {r.reviewReply ? (
                          <div className="mt-3 ml-4 pl-3 border-l-2 border-citrus/60">
                            <p className="text-tag font-mono uppercase tracking-widest text-ink-subtle">Owner reply · {formatDate(r.reviewReply.updateTime)}</p>
                            <p className="text-small text-ink-muted mt-1 whitespace-pre-line">{r.reviewReply.comment}</p>
                            <details className="mt-2">
                              <summary className="text-small text-ink-subtle cursor-pointer hover:text-ink">Edit or delete reply</summary>
                              <form action={replyGbpReview} className="mt-2 space-y-2">
                                <input type="hidden" name="project_id" value={project.id} />
                                <input type="hidden" name="review_id" value={r.reviewId} />
                                {unrepliedOnly && <input type="hidden" name="filter" value="unreplied" />}
                                <textarea name="comment" rows={3} maxLength={4096} required defaultValue={r.reviewReply.comment} className={inputClasses} />
                                <button type="submit" className={buttonStyles.secondary}>
                                  Update reply
                                </button>
                              </form>
                              <form action={deleteGbpReply} className="mt-2">
                                <input type="hidden" name="project_id" value={project.id} />
                                <input type="hidden" name="review_id" value={r.reviewId} />
                                <button type="submit" className={buttonStyles.danger}>
                                  Delete reply
                                </button>
                              </form>
                            </details>
                          </div>
                        ) : (
                          <form action={replyGbpReview} className="mt-3 space-y-2">
                            <input type="hidden" name="project_id" value={project.id} />
                            <input type="hidden" name="review_id" value={r.reviewId} />
                            {unrepliedOnly && <input type="hidden" name="filter" value="unreplied" />}
                            <textarea name="comment" rows={3} maxLength={4096} required placeholder="Write a reply — it's public on Google." className={inputClasses} />
                            <button type="submit" className={buttonStyles.primary}>
                              Post reply
                            </button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}
        </div>
      )}
    </>
  );
}
