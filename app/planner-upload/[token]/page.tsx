import type { Metadata } from "next";
import Image from "next/image";
import { db } from "@/lib/dashboard/db";
import { verifyPlannerUploadToken } from "@/lib/kb-files";
import { isStorageConfigured } from "@/lib/storage";
import PlannerLinkUploader from "@/components/planner/PlannerLinkUploader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Upload to the planner", robots: { index: false, follow: false } };

const KIND: Record<string, string> = { post: "Picture post", reel: "Reel", story: "Story", video: "Video" };

/**
 * One-off upload page opened from a link the chat makes (social_create_upload_link),
 * for a picture or video the chat can't pass to the planner itself. The
 * signed token in the URL is the only credential and expires in an hour
 * (see /api/planner/upload).
 */
export default async function PlannerUploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = verifyPlannerUploadToken(token);

  let projectLabel = "";
  if (payload) {
    const { data: project } = await db.from("client_projects").select("name, clients(name)").eq("id", payload.p).maybeSingle();
    if (project) {
      const client = Array.isArray(project.clients) ? project.clients[0]?.name : (project.clients as { name: string } | null)?.name;
      projectLabel = client ? `${client} — ${project.name}` : project.name;
    }
  }

  const settings = payload
    ? [
        payload.k ? KIND[payload.k] : "Pictures become posts, videos become Reels",
        payload.d ? `${payload.d}${payload.t ? ` at ${payload.t} (Pakistan time)` : ""}` : "the next free day",
        payload.pl?.length ? payload.pl.join(", ") : "every connected platform that takes it",
      ]
    : [];

  return (
    <main className="min-h-full bg-cloud px-5 py-10 md:py-16">
      <div className="max-w-xl mx-auto">
        <Image src="/brand/logo-horizontal.svg" alt="Ads by Shoaib" width={168} height={55} className="h-8 w-auto mb-2" />
        {!payload || !projectLabel ? (
          <>
            <h1 className="font-serif italic text-h2 mt-6">This link has expired</h1>
            <p className="text-body text-ink-muted mt-2">Upload links last one hour. Ask the chat for a new one.</p>
          </>
        ) : !isStorageConfigured ? (
          <p className="text-body mt-6">File storage isn&rsquo;t configured.</p>
        ) : (
          <>
            <h1 className="font-serif italic text-h2 mt-6">Add to {projectLabel}&rsquo;s planner</h1>
            <ul className="text-body text-ink-muted mt-3 space-y-1">
              {settings.map((s) => (
                <li key={s}>{s}</li>
              ))}
              {payload.c ? <li>With the caption from the chat (when one file is added)</li> : null}
            </ul>
            <PlannerLinkUploader token={token} />
          </>
        )}
      </div>
    </main>
  );
}
