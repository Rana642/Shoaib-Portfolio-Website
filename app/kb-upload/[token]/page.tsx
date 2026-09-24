import type { Metadata } from "next";
import Image from "next/image";
import { db } from "@/lib/dashboard/db";
import { verifyUploadToken } from "@/lib/kb-files";
import { isStorageConfigured } from "@/lib/storage";
import KbUploader from "@/components/kb/KbUploader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Upload to knowledge base", robots: { index: false, follow: false } };

const KIND_LABELS: Record<string, string> = {
  product_image: "Product photo",
  reference_image: "Reference image",
  logo: "Logo",
  document: "Document",
  other: "File",
};

/**
 * One-off upload page opened from a link Claude mints (kb_create_upload_link),
 * so an image from the chat can land in a project's knowledge base without the
 * model having to pass raw bytes. The signed token in the URL is the only
 * credential and expires in an hour (see /api/kb/upload).
 */
export default async function KbUploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = verifyUploadToken(token);

  let projectLabel = "";
  let productName = "";
  if (payload) {
    const { data: project } = await db.from("client_projects").select("name, clients(name)").eq("id", payload.p).maybeSingle();
    if (project) {
      const client = Array.isArray(project.clients) ? project.clients[0]?.name : (project.clients as { name: string } | null)?.name;
      projectLabel = `${client ?? "Unknown"} — ${project.name}`;
    }
    if (payload.pr) {
      const { data: product } = await db.from("project_products").select("name").eq("id", payload.pr).maybeSingle();
      productName = product?.name ?? "";
    }
  }

  return (
    <main className="min-h-full bg-cloud px-5 py-10 md:py-16">
      <div className="max-w-xl mx-auto">
        <Image src="/brand/logo-horizontal.svg" alt="Ads by Shoaib" width={168} height={55} className="h-8 w-auto mb-2" />
        {!payload || !projectLabel ? (
          <>
            <h1 className="font-serif italic text-h2 mt-6">This link has expired</h1>
            <p className="text-body text-ink-muted mt-2">Upload links last one hour. Ask Claude for a new one (kb_create_upload_link).</p>
          </>
        ) : !isStorageConfigured ? (
          <p className="text-body mt-6">File storage isn&rsquo;t configured.</p>
        ) : (
          <>
            <h1 className="font-serif italic text-h2 mt-6">Add to {projectLabel}</h1>
            <p className="text-body text-ink-muted mt-2">
              {KIND_LABELS[payload.k] ?? "File"}: <strong className="text-ink">{payload.t}</strong>
              {productName ? <> · product <strong className="text-ink">{productName}</strong></> : null}
              {payload.m ? " · will become the product's main photo" : ""}
            </p>
            <KbUploader token={token} imagesOnly={["product_image", "reference_image", "logo"].includes(payload.k)} />
          </>
        )}
      </div>
    </main>
  );
}
