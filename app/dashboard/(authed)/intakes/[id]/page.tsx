import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download, Mail, Lock, LockOpen } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { formatDate } from "@/lib/dashboard/format";
import { siteUrl } from "@/lib/seo";
import { deleteIntake, setIntakeLocked } from "@/lib/dashboard/actions/intakes";
import { isStorageConfigured, presignDownload } from "@/lib/storage";
import { Card, StatusBadge, buttonStyles } from "@/components/dashboard/ui";
import WhatsAppShareLink from "@/components/dashboard/WhatsAppShareLink";
import DeleteButton from "@/components/dashboard/DeleteButton";
import type { ClientIntake } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";

const fields: { key: keyof ClientIntake; label: string }[] = [
  { key: "contact_name", label: "Full name" },
  { key: "contact_role", label: "Designation" },
  { key: "registered_name", label: "Business / brand name" },
  { key: "contact_emails", label: "Business email" },
  { key: "contact_phone", label: "Business phone" },
  { key: "whatsapp", label: "Business WhatsApp" },
  { key: "website", label: "Website" },
  { key: "address", label: "Business address" },
  { key: "operating_days", label: "Operating days" },
  { key: "hours_open", label: "Opening time" },
  { key: "hours_close", label: "Closing time" },
  { key: "service_areas", label: "Service areas" },
  { key: "landmark", label: "Landmark / directions" },
  { key: "target_audience", label: "Ideal customer" },
  { key: "brand_notes", label: "Brand notes" },
  { key: "competitors", label: "Competitor / reference sites" },
  { key: "platforms", label: "Preferred platforms" },
  { key: "social_handles", label: "Desired handles" },
  { key: "master_email", label: "Master Gmail" },
  { key: "account_access_notes", label: "Account access" },
  { key: "brand_asset_links", label: "Asset links" },
  { key: "additional_notes", label: "Notes" },
];

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type AssetLink = { key: string; name: string; size: number; url: string | null };

function AssetGroup({ title, items }: { title: string; items: AssetLink[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-8 pt-6 border-t border-ink/10">
      <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-3">
        {title} ({items.length})
      </p>
      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.key} className="flex items-center gap-3 rounded-lg border border-ink/10 bg-white px-3.5 py-2.5">
            <span className="text-small truncate flex-1">{a.name}</span>
            <span className="text-tag text-ink-subtle whitespace-nowrap">{humanSize(a.size)}</span>
            {a.url ? (
              <a
                href={a.url}
                className="inline-flex items-center gap-1.5 text-small text-cobalt hover:text-ink transition-colors"
              >
                <Download className="size-4" aria-hidden />
                Download
              </a>
            ) : (
              <span className="text-tag text-ink-subtle">storage off</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function IntakeDetailPage({ params }: PageProps<"/dashboard/intakes/[id]">) {
  const { id } = await params;

  const { data } = await db.from("client_intakes").select("*").eq("id", id).single();
  if (!data) notFound();
  const intake = data as ClientIntake;

  const publicUrl = `${siteUrl}/intake/${intake.access_token}`;
  const submitted = intake.status === "submitted";

  // Presign each uploaded asset for download (server-side, authed).
  const assetLinks =
    isStorageConfigured && intake.assets?.length
      ? await Promise.all(
          intake.assets.map(async (a) => ({ ...a, url: await presignDownload(a.key, a.name) }))
        )
      : (intake.assets ?? []).map((a) => ({ ...a, url: null as string | null }));

  async function handleDelete() {
    "use server";
    return deleteIntake(id);
  }

  async function toggleLock() {
    "use server";
    await setIntakeLocked(id, !intake.locked);
  }

  const filled = fields.filter((f) => (intake[f.key] as string | null)?.trim());

  return (
    <>
      <Link
        href="/dashboard/intakes"
        className="group inline-flex items-center gap-2 text-small text-ink-subtle hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
        All intakes
      </Link>

      <div className="flex flex-wrap items-center gap-4 mb-2">
        <h1 className="font-serif italic text-h2">{intake.business_name}</h1>
        <StatusBadge status={intake.status} />
      </div>
      <p className="text-small text-ink-muted mb-8">Created {formatDate(intake.created_at)}</p>

      {/* Share */}
      <Card className="p-6 mb-6">
        <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-3">
          Share this intake
        </p>
        <div className="flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 mb-4">
          <span className="text-small text-ink-muted truncate flex-1">{publicUrl}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <WhatsAppShareLink
            url={publicUrl}
            message={`Hi! Please fill in this quick form so I can set up your social accounts — ${intake.business_name}:`}
          />
          <a
            href={`mailto:?subject=${encodeURIComponent(
              `Account setup details — ${intake.business_name}`
            )}&body=${encodeURIComponent(
              `Please fill in this quick form so I can set up your social accounts:\n\n${publicUrl}`
            )}`}
            className={buttonStyles.secondary}
          >
            <Mail className="size-4" aria-hidden />
            Email
          </a>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer" className={buttonStyles.secondary}>
            Open form
          </a>
        </div>

        <div className="mt-5 pt-4 border-t border-ink/10 flex flex-wrap items-center justify-between gap-3">
          <p className="text-small text-ink-muted flex items-center gap-2">
            {intake.locked ? (
              <Lock className="size-4 text-ink-subtle" aria-hidden />
            ) : (
              <LockOpen className="size-4 text-ink-subtle" aria-hidden />
            )}
            {intake.locked
              ? "Locked — the client can no longer edit."
              : "Open — the client can still edit and re-submit from the link."}
          </p>
          <form action={toggleLock}>
            <button type="submit" className={buttonStyles.secondary}>
              {intake.locked ? "Unlock (allow edits)" : "Lock form (stop edits)"}
            </button>
          </form>
        </div>
      </Card>

      {/* Submission */}
      {submitted ? (
        <Card className="p-8">
          <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-1">
            Submitted
          </p>
          {intake.submitted_at && (
            <p className="text-small text-ink-muted mb-6">{formatDate(intake.submitted_at)}</p>
          )}

          <dl className="space-y-6">
            {filled.map((f) => (
              <div key={f.key}>
                <dt className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
                  {f.label}
                </dt>
                <dd className="text-body text-ink mt-1.5 whitespace-pre-line">
                  {intake[f.key] as string}
                </dd>
              </div>
            ))}
          </dl>

          {intake.brand_colors?.trim() && (
            <div className="mt-6">
              <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-2">
                Brand colours
              </p>
              <div className="flex flex-wrap gap-3">
                {intake.brand_colors.split(",").map((c) => {
                  const hex = c.trim();
                  return (
                    <span key={hex} className="inline-flex items-center gap-2 rounded-lg border border-ink/10 pl-1.5 pr-2.5 py-1">
                      <span className="size-6 rounded border border-ink/10" style={{ backgroundColor: hex }} aria-hidden />
                      <span className="font-mono text-tag uppercase">{hex}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <AssetGroup title="Logo" items={assetLinks.filter((a) => a.kind === "logo")} />
          <AssetGroup title="Media & product photos" items={assetLinks.filter((a) => a.kind === "media")} />
          <AssetGroup title="Other files" items={assetLinks.filter((a) => a.kind !== "logo" && a.kind !== "media")} />

          {filled.length === 0 && assetLinks.length === 0 && (
            <p className="text-small text-ink-muted">The client submitted the form with no details filled in.</p>
          )}
        </Card>
      ) : (
        <Card className="p-8 text-center">
          <p className="text-body-lg font-medium">Waiting on the client</p>
          <p className="text-small text-ink-muted mt-1">
            Their answers will appear here once they submit the form.
          </p>
        </Card>
      )}

      <div className="mt-10 pt-8 border-t border-ink/10">
        <DeleteButton action={handleDelete} label="Delete intake" />
      </div>
    </>
  );
}
