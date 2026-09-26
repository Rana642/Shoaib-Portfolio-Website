"use client";

import { useRef, useState, useTransition } from "react";
import { Check, FileText, LoaderCircle, Upload, X } from "lucide-react";
import { submitIntake } from "@/lib/dashboard/actions/intakes";
import { Card, Field, buttonStyles, inputClasses } from "@/components/dashboard/ui";
import type { ClientIntake, IntakeAsset } from "@/lib/dashboard/types";

const MAX_BYTES = 50 * 1024 * 1024;

// What the client is asked to share in "Branding assets".
const ASSET_CHECKLIST = [
  "Logo (PNG / vector)",
  "Brand colours",
  "Brand guidelines (if available)",
  "Product images",
  "Team / office photos",
  "Product catalogue / brochures",
  "Videos / existing marketing material",
];

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The social media account setup intake: one page, four short sections —
 * client information, brand information, branding assets, competitors &
 * references. Everything is optional; the client can come back and edit
 * until Shoaib locks the form.
 */
export default function IntakeForm({
  token,
  uploadsEnabled,
  initial,
}: {
  token: string;
  uploadsEnabled: boolean;
  /** Existing answers, so a client returning to the link can edit them. */
  initial?: ClientIntake;
}) {
  const competitors = (initial?.competitors ?? "").split("\n");
  const [error, setError] = useState<string | null>(null);
  // Already-submitted clients land on the "thanks" screen but can re-open
  // the (pre-filled) form to edit, until Shoaib locks it.
  const [submitted, setSubmitted] = useState(initial?.status === "submitted");
  const [pending, startTransition] = useTransition();
  const [assets, setAssets] = useState<IntakeAsset[]>(initial?.assets ?? []);
  const [uploading, setUploading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) {
        setError(`"${file.name}" is over 50 MB — please share it through the Drive / WeTransfer link instead.`);
        continue;
      }
      try {
        const res = await fetch(`/api/intake/${token}/upload-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Upload failed. Please try again.");
          continue;
        }
        const put = await fetch(data.url, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!put.ok) {
          setError(`Couldn't upload "${file.name}". Please try again.`);
          continue;
        }
        setAssets((prev) => [...prev, { key: data.key, name: file.name, size: file.size, type: file.type, kind: "media" }]);
      } catch {
        setError(`Couldn't upload "${file.name}". Please try again.`);
      }
    }
    setUploading(false);
  };

  const handleSubmit = () => {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    setError(null);
    const list = [1, 2, 3]
      .map((n) => String(formData.get(`competitor_${n}`) ?? "").trim())
      .filter(Boolean)
      .join("\n");
    formData.set("competitors", list);
    formData.set("assets", JSON.stringify(assets));
    startTransition(async () => {
      const res = await submitIntake(token, formData);
      if (res?.error) setError(res.error);
      else {
        setSubmitted(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  };

  if (submitted) {
    return (
      <Card variant="solid" className="p-8 text-center">
        <div className="inline-flex size-12 items-center justify-center rounded-full bg-forest/15 text-forest mb-4">
          <Check className="size-6" aria-hidden />
        </div>
        <p className="text-body-lg font-medium">Thanks — got everything.</p>
        <p className="text-small text-ink-muted mt-1">I&apos;ll take it from here and be in touch to get your accounts set up.</p>
        <button type="button" onClick={() => setSubmitted(false)} className={`${buttonStyles.secondary} mt-6`}>
          Need to change something? Edit my answers
        </button>
      </Card>
    );
  }

  const heading = "font-semibold text-body-lg";

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      // Enter in a single-line field shouldn't submit a half-filled form.
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
      }}
      className="space-y-6"
    >
      {/* 1 — Client information */}
      <Card variant="solid" className="p-6 space-y-5">
        <h2 className={heading}>Client information</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Business / company name" htmlFor="registered_name">
            <input
              id="registered_name"
              name="registered_name"
              defaultValue={initial?.registered_name ?? initial?.business_name ?? ""}
              className={inputClasses}
            />
          </Field>
          <Field label="Business phone / WhatsApp" htmlFor="contact_phone">
            <input
              id="contact_phone"
              name="contact_phone"
              type="tel"
              defaultValue={initial?.contact_phone ?? initial?.whatsapp ?? ""}
              className={inputClasses}
            />
          </Field>
          <Field label="Business email" htmlFor="contact_emails">
            <input id="contact_emails" name="contact_emails" type="email" defaultValue={initial?.contact_emails ?? ""} className={inputClasses} />
          </Field>
          <Field label="Website (if available)" htmlFor="website">
            <input id="website" name="website" placeholder="https://" defaultValue={initial?.website ?? ""} className={inputClasses} />
          </Field>
        </div>
        <Field label="Business address" htmlFor="address">
          <textarea id="address" name="address" rows={2} defaultValue={initial?.address ?? ""} className={inputClasses} />
        </Field>
      </Card>

      {/* 2 — Brand information */}
      <Card variant="solid" className="p-6 space-y-5">
        <h2 className={heading}>Brand information</h2>
        <Field label="Business overview" htmlFor="business_overview" hint="Describe your business, products or services.">
          <textarea
            id="business_overview"
            name="business_overview"
            rows={3}
            defaultValue={initial?.business_overview ?? ""}
            className={inputClasses}
          />
        </Field>
        <Field
          label="Target audience"
          htmlFor="target_audience"
          hint="For example: guests, travellers, D2C, farmers, dealers, distributors, retailers, B2B clients."
        >
          <textarea id="target_audience" name="target_audience" rows={2} defaultValue={initial?.target_audience ?? ""} className={inputClasses} />
        </Field>
        <Field label="Unique selling proposition" htmlFor="usp" hint="What makes your brand different?">
          <textarea id="usp" name="usp" rows={2} defaultValue={initial?.usp ?? ""} className={inputClasses} />
        </Field>
      </Card>

      {/* 3 — Branding assets */}
      <Card variant="solid" className="p-6 space-y-5">
        <div>
          <h2 className={heading}>Branding assets</h2>
          <p className="text-small text-ink-muted mt-1">Please share whatever you have of the following:</p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 mt-3">
            {ASSET_CHECKLIST.map((item) => (
              <li key={item} className="flex items-center gap-2 text-small">
                <span className="size-1.5 rounded-full bg-citrus shrink-0" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <Field label="Drive folder / WeTransfer link" htmlFor="brand_asset_links" hint="Paste one or more links — one per line.">
          <textarea
            id="brand_asset_links"
            name="brand_asset_links"
            rows={2}
            defaultValue={initial?.brand_asset_links ?? ""}
            className={inputClasses}
          />
        </Field>
        {uploadsEnabled && (
          <UploadZone
            uploading={uploading}
            files={assets}
            onFiles={uploadFiles}
            onRemove={(key) => setAssets((prev) => prev.filter((a) => a.key !== key))}
          />
        )}
      </Card>

      {/* 4 — Competitors & references */}
      <Card variant="solid" className="p-6 space-y-5">
        <h2 className={heading}>Competitors &amp; references</h2>
        <Field label="Competitors you like or want to compete with" hint="Names or links to their pages.">
          <div className="space-y-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex items-center gap-3">
                <span className="w-4 text-small text-ink-subtle text-right">{n}.</span>
                <input
                  name={`competitor_${n}`}
                  aria-label={`Competitor ${n}`}
                  defaultValue={competitors[n - 1] ?? ""}
                  className={inputClasses}
                />
              </div>
            ))}
          </div>
        </Field>
        <Field label="Any pages or design styles you like?" htmlFor="design_references" hint="Links to pages, or describe the look you want.">
          <textarea
            id="design_references"
            name="design_references"
            rows={3}
            defaultValue={initial?.design_references ?? ""}
            className={inputClasses}
          />
        </Field>
      </Card>

      {error && <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-small text-ink-muted">Nothing here is mandatory — fill in what you can.</p>
        <button type="submit" disabled={pending || uploading} className={buttonStyles.primary}>
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
          Submit
        </button>
      </div>
    </form>
  );
}

function UploadZone({
  uploading,
  files,
  onFiles,
  onRemove,
}: {
  uploading: boolean;
  files: IntakeAsset[];
  onFiles: (files: FileList | null) => void;
  onRemove: (key: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <Field label="…or upload files here" hint="Images, PDFs, short videos or a .zip — up to 50 MB each.">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*,.pdf,.zip,.svg,.ai,.eps"
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-7 text-center cursor-pointer transition-colors ${
          dragging ? "border-citrus bg-citrus/10" : "border-ink/20 hover:border-citrus hover:bg-citrus/[0.04]"
        }`}
      >
        {uploading ? (
          <LoaderCircle className="size-6 text-ink-subtle animate-spin" aria-hidden />
        ) : (
          <Upload className="size-6 text-ink-subtle" aria-hidden />
        )}
        <p className="text-small text-ink-muted">{uploading ? "Uploading…" : "Drag & drop, or click to choose"}</p>
      </div>
      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((a) => (
            <li key={a.key} className="flex items-center gap-3 rounded-lg border border-ink/10 bg-white px-3 py-2">
              <FileText className="size-4 text-ink-subtle shrink-0" aria-hidden />
              <span className="text-small truncate flex-1">{a.name}</span>
              <span className="text-tag text-ink-subtle whitespace-nowrap">{humanSize(a.size)}</span>
              <button type="button" onClick={() => onRemove(a.key)} aria-label={`Remove ${a.name}`}>
                <X className="size-4 text-ink-subtle hover:text-red-700" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}
