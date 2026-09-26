import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, Clock, Send } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { can, canSeeProject, requirePortalUser } from "@/lib/portal/auth";
import { presignDownload, isStorageConfigured } from "@/lib/storage";
import { Card } from "@/components/dashboard/ui";
import DeleteButton from "@/components/dashboard/DeleteButton";
import PlannerUploader from "@/components/portal/PlannerUploader";
import { deletePortalUpload } from "@/lib/portal/planner";
import type { ScheduledPost } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Planner" };

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
};

// Client-facing status: failed posts never show here (they're mine to fix).
const STATUS: Record<string, { label: string; className: string; icon: typeof Clock }> = {
  pending_caption: { label: "Being prepared", className: "bg-cobalt/10 border-cobalt/30", icon: Clock },
  scheduled: { label: "Scheduled", className: "bg-citrus/20 border-citrus/60", icon: CalendarCheck },
  posted: { label: "Posted", className: "bg-forest/10 border-forest/40", icon: Send },
};

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Karachi" });

/** Tomorrow in Pakistan, as YYYY-MM-DD — the upload form's default date. */
function tomorrowInKarachi() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * The client's content planner: what's coming up and what's gone out for
 * one of their projects, and (with "uploads") a place to add final
 * graphics. Someone with uploads but not the planner only sees their own
 * team's uploads.
 */
export default async function PortalPlannerPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const ctx = await requirePortalUser();
  const canView = can(ctx, "planner");
  const canUpload = can(ctx, "uploads");
  if (!canView && !canUpload) redirect("/portal");

  const { project } = await searchParams;
  const { data: all } = await db.from("client_projects").select("id, name").eq("client_id", ctx.clientId).order("sort_order");
  const projects = (all ?? []).filter((p) => canSeeProject(ctx, p.id as string));
  if (projects.length === 0) {
    return (
      <>
        <h1 className="font-serif italic text-h2">Planner</h1>
        <Card variant="solid" className="p-6 mt-8">
          <p className="text-small text-ink-muted">There are no projects here yet — I&apos;ll set one up for you.</p>
        </Card>
      </>
    );
  }
  const selected = projects.find((p) => p.id === project) ?? projects[0];

  const { data } = await db
    .from("scheduled_posts")
    .select("*")
    .eq("project_id", selected.id)
    .neq("status", "failed")
    .order("scheduled_at", { ascending: true });
  const posts = ((data ?? []) as ScheduledPost[]).filter((p) => canView || p.uploaded_by_email);
  const withUrls = await Promise.all(
    posts.map(async (p) => ({ ...p, imageUrl: await presignDownload(p.media_key).catch(() => null) }))
  );
  const upcoming = withUrls.filter((p) => p.status !== "posted");
  const posted = withUrls.filter((p) => p.status === "posted").reverse().slice(0, 30);

  const section = (title: string, list: typeof withUrls, empty: string) => (
    <section className="mt-8">
      <h2 className="text-body-lg font-semibold mb-3">{title}</h2>
      {list.length === 0 ? (
        <p className="text-small text-ink-muted">{empty}</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {list.map((p) => {
            const status = STATUS[p.status] ?? STATUS.pending_caption;
            const mine = Boolean(p.uploaded_by_email);
            return (
              <li key={p.id}>
                <Card variant="solid" className="p-3 flex gap-3">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt="" className="size-20 rounded-lg object-cover border border-ink/10 shrink-0" />
                  ) : (
                    <div className="size-20 rounded-lg bg-ink/10 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{p.scheduled_at ? dayLabel(p.scheduled_at) : "No date yet"}</span>
                      <span className={cn("inline-flex items-center gap-1 text-xs rounded-full border px-2 py-0.5", status.className)}>
                        <status.icon className="size-3" aria-hidden />
                        {status.label}
                      </span>
                    </div>
                    <p className="text-xs text-ink-subtle mt-0.5">
                      {p.target_platforms?.length
                        ? p.target_platforms.map((x) => PLATFORM_LABELS[x] ?? x).join(", ")
                        : "All connected pages"}
                      {mine && " · uploaded by your team"}
                    </p>
                    {p.caption ? (
                      <p className="text-small text-ink-muted mt-1.5 line-clamp-3">{p.caption}</p>
                    ) : (
                      p.client_note && <p className="text-small text-ink-muted mt-1.5 line-clamp-2">Note: {p.client_note}</p>
                    )}
                    {canUpload && mine && p.status === "pending_caption" && (
                      <div className="mt-2">
                        <DeleteButton
                          label="Remove"
                          action={async () => {
                            "use server";
                            return deletePortalUpload(p.id);
                          }}
                        />
                      </div>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <>
      <h1 className="font-serif italic text-h2">Planner</h1>
      <p className="text-body text-ink-muted mt-2 max-w-2xl">
        {canView ? "What's coming up and what's gone out." : "Your uploads and where they are."}
        {canUpload && " Add final graphics any time — I'll write the captions and schedule them."}
      </p>

      {projects.length > 1 && (
        <div className="flex flex-wrap gap-2 mt-6" role="group" aria-label="Project">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/portal/planner?project=${p.id}`}
              aria-current={p.id === selected.id ? "page" : undefined}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-small transition-colors",
                p.id === selected.id ? "border-ink bg-ink text-cloud" : "border-ink/20 text-ink-muted hover:text-ink"
              )}
            >
              {p.name}
            </Link>
          ))}
        </div>
      )}

      {canUpload && (
        <div className="mt-6">
          {isStorageConfigured ? (
            <PlannerUploader key={selected.id} projectId={selected.id} defaultDate={tomorrowInKarachi()} />
          ) : (
            <Card variant="solid" className="p-5">
              <p className="text-small text-ink-muted">Uploads aren&apos;t available right now — please send graphics to me directly.</p>
            </Card>
          )}
        </div>
      )}

      {section("Coming up", upcoming, canView ? "Nothing scheduled yet." : "Nothing uploaded yet.")}
      {section("Posted", posted, "Nothing posted yet.")}
    </>
  );
}
