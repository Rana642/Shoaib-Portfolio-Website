"use client";

import { useState, useRef, useTransition } from "react";
import { LoaderCircle, Upload, X, FileText, Paperclip } from "lucide-react";
import { submitIntake } from "@/lib/dashboard/actions/intakes";
import { Field, inputClasses, buttonStyles, Card } from "@/components/dashboard/ui";
import type { IntakeAsset } from "@/lib/dashboard/types";

const MAX_BYTES = 50 * 1024 * 1024;

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function IntakeForm({
  token,
  uploadsEnabled,
}: {
  token: string;
  /** File upload lights up once object storage (R2) is configured. */
  uploadsEnabled: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [assets, setAssets] = useState<IntakeAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) {
        setError(`"${file.name}" is over 50 MB — please share it as a link instead.`);
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
        setAssets((prev) => [
          ...prev,
          { key: data.key, name: file.name, size: file.size, type: file.type },
        ]);
      } catch {
        setError(`Couldn't upload "${file.name}". Please try again.`);
      }
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
  };

  const removeAsset = (key: string) => setAssets((prev) => prev.filter((a) => a.key !== key));

  const onSubmit = (formData: FormData) => {
    setError(null);
    formData.set("assets", JSON.stringify(assets));
    startTransition(async () => {
      const res = await submitIntake(token, formData);
      if (res?.error) setError(res.error);
      else setSubmitted(true);
    });
  };

  if (submitted) {
    return (
      <Card variant="solid" className="p-8 text-center">
        <p className="text-body-lg font-medium">Thanks — got everything.</p>
        <p className="text-small text-ink-muted mt-1">
          I&apos;ll take it from here and be in touch to get your accounts set up.
        </p>
      </Card>
    );
  }

  return (
    <form action={onSubmit} className="space-y-6">
      <Card variant="solid" className="p-6 space-y-5">
        <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">The basics</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Your name" htmlFor="contact_name">
            <input id="contact_name" name="contact_name" className={inputClasses} />
          </Field>
          <Field label="Phone / WhatsApp" htmlFor="contact_phone">
            <input id="contact_phone" name="contact_phone" className={inputClasses} />
          </Field>
        </div>
        <Field label="Contact email(s)" htmlFor="contact_emails" hint="One per line, or comma-separated.">
          <textarea id="contact_emails" name="contact_emails" rows={2} className={inputClasses} />
        </Field>
        <Field label="Business address" htmlFor="address" hint="Used for local pages and profiles.">
          <textarea id="address" name="address" rows={2} className={inputClasses} />
        </Field>
        <Field label="Website" htmlFor="website">
          <input id="website" name="website" placeholder="https://" className={inputClasses} />
        </Field>
        <Field
          label="Existing social profiles"
          htmlFor="social_handles"
          hint="Links or @handles for any pages you already have — one per line."
        >
          <textarea id="social_handles" name="social_handles" rows={3} className={inputClasses} />
        </Field>
      </Card>

      <Card variant="solid" className="p-6 space-y-5">
        <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
          Positioning
        </p>
        <Field
          label="Competitors"
          htmlFor="competitors"
          hint="Names or links of 3–5 competitors you want to be measured against."
        >
          <textarea id="competitors" name="competitors" rows={3} className={inputClasses} />
        </Field>
        <Field
          label="Target audience"
          htmlFor="target_audience"
          hint="Who are you trying to reach? Location, age, interests, anything relevant."
        >
          <textarea id="target_audience" name="target_audience" rows={3} className={inputClasses} />
        </Field>
        <Field
          label="Brand notes"
          htmlFor="brand_notes"
          hint="Colours, fonts, tone of voice, and anything to do or avoid."
        >
          <textarea id="brand_notes" name="brand_notes" rows={3} className={inputClasses} />
        </Field>
      </Card>

      <Card variant="solid" className="p-6 space-y-5">
        <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
          Brand assets
        </p>
        {uploadsEnabled && (
          <div>
            <input
              ref={fileInput}
              type="file"
              multiple
              onChange={(e) => onFiles(e.target.files)}
              className="hidden"
              accept="image/*,application/pdf,video/*,.zip,.ai,.psd,.eps,.svg"
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className={`${buttonStyles.secondary} w-full justify-center`}
            >
              {uploading ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : (
                <Upload className="size-4" aria-hidden />
              )}
              {uploading ? "Uploading…" : "Upload logos, content, guidelines"}
            </button>
            <p className="text-tag text-ink-subtle mt-2">
              Images, PDFs, video, zip — up to 50 MB each.
            </p>

            {assets.length > 0 && (
              <ul className="mt-4 space-y-2">
                {assets.map((a) => (
                  <li
                    key={a.key}
                    className="flex items-center gap-3 rounded-lg border border-ink/10 bg-white px-3 py-2"
                  >
                    <FileText className="size-4 text-ink-subtle shrink-0" aria-hidden />
                    <span className="text-small truncate flex-1">{a.name}</span>
                    <span className="text-tag text-ink-subtle whitespace-nowrap">
                      {humanSize(a.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAsset(a.key)}
                      aria-label={`Remove ${a.name}`}
                      className="text-ink-subtle hover:text-red-700 transition-colors"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <Field
          label={uploadsEnabled ? "…or share a link" : "Share your assets"}
          htmlFor="brand_asset_links"
          hint="Google Drive / Dropbox / WeTransfer links to logos, past content, brand guidelines."
        >
          <textarea id="brand_asset_links" name="brand_asset_links" rows={3} className={inputClasses} />
        </Field>
      </Card>

      <Card variant="solid" className="p-6 space-y-5">
        <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">Anything else</p>
        <Field
          label="Existing account access"
          htmlFor="account_access_notes"
          hint="If you already have accounts, who manages them now? (Don't share passwords here.)"
        >
          <textarea id="account_access_notes" name="account_access_notes" rows={2} className={inputClasses} />
        </Field>
        <Field label="Notes" htmlFor="additional_notes">
          <textarea id="additional_notes" name="additional_notes" rows={3} className={inputClasses} />
        </Field>
      </Card>

      {error && (
        <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || uploading}
        className={`${buttonStyles.primary} w-full justify-center`}
      >
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <Paperclip className="size-4" aria-hidden />
        )}
        Submit
      </button>
    </form>
  );
}
