import Link from "next/link";
import { Star } from "lucide-react";
import { listProjectOptions } from "@/lib/dashboard/projects";
import { formatDate } from "@/lib/dashboard/format";
import { PageHeader, Card, EmptyState, buttonStyles, inputClasses, labelClasses } from "@/components/dashboard/ui";
import { STARS, findLocation, gbpAccessToken, getGbpConnection, listReviews, type GbpReview } from "@/lib/gbp";
import { deleteGbpReply, disconnectGbp, replyGbpReview, selectGbpLocation } from "@/lib/dashboard/actions/gbp";
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
  searchParams: Promise<{ project?: string; connected?: string; replied?: string; reply_deleted?: string; disconnected?: string; error?: string; filter?: string }>;
}) {
  const params = await searchParams;
  const projects = await listProjectOptions();
  const projectId = params.project && projects.some((p) => p.id === params.project) ? params.project : null;
  const project = projects.find((p) => p.id === projectId) ?? null;
  const conn = projectId ? await getGbpConnection(projectId) : null;
  const location = conn ? findLocation(conn) : null;
  const unrepliedOnly = params.filter === "unreplied";

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

      {params.connected && <Notice tone="ok">Connected. The Business Profile locations this Google account manages are listed below.</Notice>}
      {params.replied && <Notice tone="ok">Reply posted. It shows on Google under the review.</Notice>}
      {params.reply_deleted && <Notice tone="ok">Reply deleted from Google.</Notice>}
      {params.disconnected && <Notice tone="ok">Disconnected. The saved access for this project was deleted.</Notice>}
      {params.error && <Notice tone="error">{params.error.length > 20 ? params.error : "That didn't work. Check the form and try again."}</Notice>}

      {!project ? (
        <EmptyState title="Choose a client project" description="Pick the client whose Google Business Profile you want to manage." />
      ) : !conn ? (
        <EmptyState
          title={`Connect ${project.label.split(" — ")[0]}'s Business Profile`}
          description="Sign in with the Google account that owns or manages the Business Profile and allow Socially Snap to manage it. You can disconnect at any time."
          action={
            <a href={`/api/dashboard/gbp/authorize?project_id=${project.id}`} className={buttonStyles.primary}>
              Connect with Google
            </a>
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
