"use client";

import { useState, useRef, useTransition } from "react";
import { LoaderCircle, Upload, X, FileText, Check, ArrowLeft, ArrowRight, Plus } from "lucide-react";
import { submitIntake } from "@/lib/dashboard/actions/intakes";
import { Field, inputClasses, buttonStyles, Card } from "@/components/dashboard/ui";
import type { IntakeAsset } from "@/lib/dashboard/types";

const MAX_BYTES = 50 * 1024 * 1024;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PLATFORMS = ["Facebook", "Instagram", "LinkedIn", "TikTok", "YouTube", "X (Twitter)", "Pinterest", "Snapchat"];
const STEPS = ["Contact & Company", "Hours & Locations", "Brand & Audience", "Preferences"];

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
  uploadsEnabled: boolean;
}) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  // Stateful (non-plain-input) fields.
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [sameWhatsapp, setSameWhatsapp] = useState(false);
  const [days, setDays] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [areaInput, setAreaInput] = useState("");
  const [colors, setColors] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [assets, setAssets] = useState<IntakeAsset[]>([]);
  const [uploading, setUploading] = useState<"logo" | "media" | null>(null);

  const toggle = (list: string[], set: (v: string[]) => void, val: string) =>
    set(list.includes(val) ? list.filter((x) => x !== val) : [...list, val]);

  const onPhone = (v: string) => {
    setPhone(v);
    if (sameWhatsapp) setWhatsapp(v);
  };
  const onSameWhatsapp = (checked: boolean) => {
    setSameWhatsapp(checked);
    if (checked) setWhatsapp(phone);
  };

  const addArea = () => {
    const v = areaInput.trim();
    if (v && !areas.includes(v)) setAreas([...areas, v]);
    setAreaInput("");
  };

  const uploadFiles = async (files: FileList | null, kind: "logo" | "media") => {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(kind);
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
        setAssets((prev) => [...prev, { key: data.key, name: file.name, size: file.size, type: file.type, kind }]);
      } catch {
        setError(`Couldn't upload "${file.name}". Please try again.`);
      }
    }
    setUploading(null);
  };

  const removeAsset = (key: string) => setAssets((prev) => prev.filter((a) => a.key !== key));

  const onSubmit = (formData: FormData) => {
    setError(null);
    formData.set("whatsapp", whatsapp);
    formData.set("operating_days", days.join(", "));
    formData.set("service_areas", areas.join(", "));
    formData.set("brand_colors", colors.join(", "));
    formData.set("platforms", platforms.join(", "));
    const comps = [formData.get("competitor_1"), formData.get("competitor_2"), formData.get("competitor_3")]
      .map((c) => String(c ?? "").trim())
      .filter(Boolean)
      .join("\n");
    formData.set("competitors", comps);
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
        <div className="inline-flex size-12 items-center justify-center rounded-full bg-green-500/15 text-green-600 mb-4">
          <Check className="size-6" aria-hidden />
        </div>
        <p className="text-body-lg font-medium">Thanks — got everything.</p>
        <p className="text-small text-ink-muted mt-1">
          I&apos;ll take it from here and be in touch to get your accounts set up.
        </p>
      </Card>
    );
  }

  const logos = assets.filter((a) => a.kind === "logo");
  const media = assets.filter((a) => a.kind === "media");

  return (
    <form action={onSubmit} className="space-y-6">
      {/* Progress */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-small font-medium">
            Step {step + 1} of {STEPS.length} · <span className="text-ink-muted">{STEPS[step]}</span>
          </p>
          <p className="font-mono text-tag text-ink-subtle">{Math.round(((step + 1) / STEPS.length) * 100)}%</p>
        </div>
        <div className="h-1.5 rounded-full bg-ink/10 overflow-hidden">
          <div
            className="h-full bg-citrus transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Step 1 — Contact & Company (split so it's clear which answers are
          about the person vs. about the business) */}
      <div className={step === 0 ? "space-y-6" : "hidden"}>
        <Card variant="solid" className="p-6 space-y-5">
          <div>
            <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">About you</p>
            <p className="text-small text-ink-muted mt-1">
              The person filling this out — so I know who I&apos;m coordinating with.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Your full name" htmlFor="contact_name">
              <input id="contact_name" name="contact_name" className={inputClasses} />
            </Field>
            <Field label="Your role / designation" htmlFor="contact_role" hint="e.g. Owner, Manager">
              <input id="contact_role" name="contact_role" className={inputClasses} />
            </Field>
            <Field label="Your email address" htmlFor="contact_emails">
              <input id="contact_emails" name="contact_emails" type="email" className={inputClasses} />
            </Field>
            <Field label="Your phone number" htmlFor="contact_phone">
              <input
                id="contact_phone"
                name="contact_phone"
                value={phone}
                onChange={(e) => onPhone(e.target.value)}
                className={inputClasses}
              />
            </Field>
          </div>
          <Field label="Your WhatsApp number" htmlFor="whatsapp">
            <input
              id="whatsapp"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              disabled={sameWhatsapp}
              className={`${inputClasses} ${sameWhatsapp ? "opacity-60" : ""}`}
            />
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sameWhatsapp}
                onChange={(e) => onSameWhatsapp(e.target.checked)}
                className="size-4 accent-citrus cursor-pointer"
              />
              <span className="text-small text-ink-muted">Same as phone number</span>
            </label>
          </Field>
        </Card>

        <Card variant="solid" className="p-6 space-y-5">
          <div>
            <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
              About your business
            </p>
            <p className="text-small text-ink-muted mt-1">
              Details about the company, brand, or project itself — not you personally.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Business / brand name" htmlFor="registered_name">
              <input id="registered_name" name="registered_name" className={inputClasses} />
            </Field>
            <Field label="Business website (if any)" htmlFor="website">
              <input id="website" name="website" placeholder="https://" className={inputClasses} />
            </Field>
          </div>
          <Field label="Business address" htmlFor="address" hint="The location that should appear on profiles and maps.">
            <textarea id="address" name="address" rows={2} className={inputClasses} />
          </Field>
        </Card>
      </div>

      {/* Step 2 — Hours & Locations */}
      <div className={step === 1 ? "" : "hidden"}>
        <Card variant="solid" className="p-6 space-y-5">
          <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
            Business hours &amp; locations
          </p>
          <Field label="Operating days">
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggle(days, setDays, d)}
                  className={`rounded-full border px-4 py-1.5 text-small transition-all ${
                    days.includes(d)
                      ? "border-citrus bg-citrus/15 font-medium"
                      : "border-ink/15 hover:border-citrus hover:bg-citrus/10"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Opening time" htmlFor="hours_open">
              <input id="hours_open" name="hours_open" type="time" className={inputClasses} />
            </Field>
            <Field label="Closing time" htmlFor="hours_close">
              <input id="hours_close" name="hours_close" type="time" className={inputClasses} />
            </Field>
          </div>
          <Field label="Service areas / delivery regions" hint="Cities or areas you serve — type and press Enter.">
            <div className="flex gap-2">
              <input
                value={areaInput}
                onChange={(e) => setAreaInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addArea();
                  }
                }}
                placeholder="e.g. Multan"
                className={inputClasses}
              />
              <button type="button" onClick={addArea} className={buttonStyles.secondary}>
                Add
              </button>
            </div>
            {areas.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {areas.map((a) => (
                  <span
                    key={a}
                    className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.06] px-3 py-1 text-small"
                  >
                    {a}
                    <button type="button" onClick={() => setAreas(areas.filter((x) => x !== a))} aria-label={`Remove ${a}`}>
                      <X className="size-3.5 text-ink-subtle hover:text-red-700" aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Field>
          <Field label="Landmark / directions" htmlFor="landmark" hint="Anything that helps people find you.">
            <textarea id="landmark" name="landmark" rows={2} className={inputClasses} />
          </Field>
        </Card>
      </div>

      {/* Step 3 — Brand & Audience */}
      <div className={step === 2 ? "" : "hidden"}>
        <Card variant="solid" className="p-6 space-y-5">
          <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
            Brand visuals &amp; audience
          </p>

          <UploadZone
            label="Logo"
            hint="PNG, SVG, or vector preferred."
            uploadsEnabled={uploadsEnabled}
            uploading={uploading === "logo"}
            files={logos}
            onFiles={(f) => uploadFiles(f, "logo")}
            onRemove={removeAsset}
            accept="image/*,.svg,.ai,.eps,.pdf"
          />

          <Field label="Preferred brand colours" hint="Add the colours you'd like used.">
            <div className="flex flex-wrap items-center gap-3">
              {colors.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-2 rounded-lg border border-ink/15 pl-1.5 pr-2 py-1">
                  <input
                    type="color"
                    value={c}
                    onChange={(e) => setColors(colors.map((x, j) => (j === i ? e.target.value : x)))}
                    className="size-7 rounded cursor-pointer border-0 bg-transparent p-0"
                  />
                  <span className="font-mono text-tag uppercase">{c}</span>
                  <button type="button" onClick={() => setColors(colors.filter((_, j) => j !== i))} aria-label="Remove colour">
                    <X className="size-3.5 text-ink-subtle hover:text-red-700" aria-hidden />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => setColors([...colors, "#eab308"])}
                className={`${buttonStyles.secondary} px-3 py-2`}
              >
                <Plus className="size-4" aria-hidden />
                Add colour
              </button>
            </div>
          </Field>

          <Field
            label="Who is your ideal customer?"
            htmlFor="target_audience"
            hint="Age group, lifestyle, and the problem you solve for them."
          >
            <textarea id="target_audience" name="target_audience" rows={3} className={inputClasses} />
          </Field>

          <Field label="Brand notes" htmlFor="brand_notes" hint="Fonts, tone of voice, anything to do or avoid.">
            <textarea id="brand_notes" name="brand_notes" rows={2} className={inputClasses} />
          </Field>

          <UploadZone
            label="Existing media / product photos"
            hint="For your social content — images or short videos."
            uploadsEnabled={uploadsEnabled}
            uploading={uploading === "media"}
            files={media}
            onFiles={(f) => uploadFiles(f, "media")}
            onRemove={removeAsset}
            accept="image/*,video/*,.zip"
          />

          <Field
            label={uploadsEnabled ? "…or share asset links" : "Share your assets"}
            htmlFor="brand_asset_links"
            hint="Google Drive / Dropbox / WeTransfer links."
          >
            <textarea id="brand_asset_links" name="brand_asset_links" rows={2} className={inputClasses} />
          </Field>
        </Card>
      </div>

      {/* Step 4 — Preferences */}
      <div className={step === 3 ? "" : "hidden"}>
        <Card variant="solid" className="p-6 space-y-5">
          <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
            Preferences &amp; references
          </p>
          <Field label="Competitor or reference websites you like" hint="Up to three — links you admire.">
            <div className="space-y-2">
              <input name="competitor_1" type="url" placeholder="https://" className={inputClasses} />
              <input name="competitor_2" type="url" placeholder="https://" className={inputClasses} />
              <input name="competitor_3" type="url" placeholder="https://" className={inputClasses} />
            </div>
          </Field>
          <Field label="Preferred social platforms">
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => toggle(platforms, setPlatforms, p)}
                  className={`rounded-full border px-4 py-1.5 text-small transition-all ${
                    platforms.includes(p)
                      ? "border-citrus bg-citrus/15 font-medium"
                      : "border-ink/15 hover:border-citrus hover:bg-citrus/10"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </Field>
          <Field
            label="Desired social usernames / handles"
            htmlFor="social_handles"
            hint="e.g. @yourbrand — one per line if they differ per platform."
          >
            <textarea id="social_handles" name="social_handles" rows={2} className={inputClasses} />
          </Field>
          <Field
            label="Master Gmail address"
            htmlFor="master_email"
            hint="The Google account new profiles and assets should be assigned to."
          >
            <input id="master_email" name="master_email" type="email" className={inputClasses} />
          </Field>
          <Field label="Anything else?" htmlFor="additional_notes">
            <textarea id="additional_notes" name="additional_notes" rows={3} className={inputClasses} />
          </Field>
        </Card>
      </div>

      {error && (
        <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      {/* Nav */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className={`${buttonStyles.secondary} ${step === 0 ? "invisible" : ""}`}
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </button>

        {step < STEPS.length - 1 ? (
          <button type="button" onClick={() => setStep((s) => s + 1)} className={buttonStyles.primary}>
            Next
            <ArrowRight className="size-4" aria-hidden />
          </button>
        ) : (
          <button type="submit" disabled={pending || uploading !== null} className={buttonStyles.primary}>
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
            Submit
          </button>
        )}
      </div>
    </form>
  );
}

function UploadZone({
  label,
  hint,
  uploadsEnabled,
  uploading,
  files,
  onFiles,
  onRemove,
  accept,
}: {
  label: string;
  hint: string;
  uploadsEnabled: boolean;
  uploading: boolean;
  files: IntakeAsset[];
  onFiles: (files: FileList | null) => void;
  onRemove: (key: string) => void;
  accept: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  if (!uploadsEnabled) return null;

  return (
    <Field label={label} hint={hint}>
      <input ref={inputRef} type="file" multiple accept={accept} className="hidden" onChange={(e) => onFiles(e.target.files)} />
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
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center cursor-pointer transition-colors ${
          dragging ? "border-citrus bg-citrus/10" : "border-ink/20 hover:border-citrus hover:bg-citrus/[0.04]"
        }`}
      >
        {uploading ? (
          <LoaderCircle className="size-6 text-ink-subtle animate-spin" aria-hidden />
        ) : (
          <Upload className="size-6 text-ink-subtle" aria-hidden />
        )}
        <p className="text-small text-ink-muted">
          {uploading ? "Uploading…" : "Drag & drop, or click to choose"}
        </p>
        <p className="text-tag text-ink-subtle">Up to 50 MB each</p>
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
