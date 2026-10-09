"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Megaphone, X } from "lucide-react";
import { buttonStyles, inputClasses } from "@/components/dashboard/ui";
import { TemplatePreview } from "@/components/whatsapp/Templates";
import { fillVars, type WaTemplate } from "@/lib/whatsapp/template-shared";

type Audience = { statuses?: string[]; tag?: string; source?: string; activeDays?: number; nameFallback?: string };
type Result = { error?: string; ok?: boolean; total?: number } | undefined;

const STATUSES = [
  { value: "new", label: "New" },
  { value: "replied", label: "Replied" },
  { value: "booked", label: "Won / booked" },
  { value: "lost", label: "Lost" },
];
const SOURCES = [
  { value: "", label: "Any source" },
  { value: "FB", label: "Facebook/Instagram ad" },
  { value: "GA", label: "Google ad" },
  { value: "GS", label: "Google search" },
  { value: "WEB", label: "Website" },
  { value: "none", label: "No code" },
];
const ACTIVE = [
  { value: 0, label: "Any time" },
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
  { value: 365, label: "Last 12 months" },
];

/** New broadcast: template + variables, audience filters with a live count and cost, send now or later. */
export default function BroadcastForm({
  templates,
  tags,
  pkrRate,
  onPreview,
  onCreate,
}: {
  templates: WaTemplate[];
  tags: string[];
  /** Today's USD → PKR rate. */
  pkrRate: number;
  onPreview: (audience: Audience, category: string) => Promise<{ count: number; capped: boolean; usd: number }>;
  onCreate: (input: {
    name: string;
    templateName: string;
    templateLanguage: string;
    params: string[];
    audience: Audience;
    scheduledAt: string | null;
  }) => Promise<Result>;
}) {
  const [name, setName] = useState("");
  const [templateKey, setTemplateKey] = useState(templates[0] ? `${templates[0].name}|${templates[0].language}` : "");
  const template = templates.find((t) => `${t.name}|${t.language}` === templateKey) ?? null;
  const [params, setParams] = useState<string[]>([]);
  const [audience, setAudience] = useState<Audience>({ statuses: [], tag: "", source: "", activeDays: 0, nameFallback: "there" });
  const [when, setWhen] = useState<"now" | "later">("now");
  const [at, setAt] = useState("");
  const [consent, setConsent] = useState(false);
  const [preview, setPreview] = useState<{ count: number; capped: boolean; usd: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const vars = template?.vars ?? 0;
  const values = Array.from({ length: vars }, (_, i) => params[i] ?? "");
  const category = template?.category ?? "UTILITY";

  // Live audience count + cost (debounced).
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await onPreview(audience, category);
      if (!cancelled) setPreview(r);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [audience, category, onPreview]);

  const setA = (patch: Partial<Audience>) => setAudience((a) => ({ ...a, ...patch }));
  const sampleName = "Ali";
  const previewValues = values.map((v) => v.replace(/\{name\}/gi, sampleName));

  const submit = () => {
    setError(null);
    setDone(null);
    if (!template) return setError("Pick an approved template.");
    if (!name.trim()) return setError("Give the broadcast a name.");
    if (values.some((v) => !v.trim())) return setError("Fill in every variable.");
    if (category === "MARKETING" && !consent) return setError("Confirm these contacts agreed to get offers from you.");
    if (when === "later" && !at) return setError("Pick when to send it.");
    const count = preview?.count ?? 0;
    if (!count) return setError("No contacts match this audience.");
    if (!confirm(`Send "${template.name}" to ${count.toLocaleString("en-US")} contacts${when === "later" ? ` on ${at.replace("T", " ")}` : " now"}?`)) return;
    start(async () => {
      const r = await onCreate({
        name,
        templateName: template.name,
        templateLanguage: template.language,
        params: values,
        audience,
        // datetime-local is Pakistan time
        scheduledAt: when === "later" ? `${at}:00+05:00` : null,
      });
      if (r?.error) setError(r.error);
      else {
        setDone(`Queued for ${r?.total?.toLocaleString("en-US")} contacts — it sends ${when === "now" ? "over the next few minutes" : "at the time you picked"}.`);
        setName("");
        setConsent(false);
        router.refresh();
      }
    });
  };

  if (!templates.length) {
    return <p className="text-small text-ink-muted">No approved templates on this number yet — create one under Templates first.</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px] items-start">
      <div className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-small">
            <span className="block text-ink-muted mb-1">Broadcast name (only you see it)</span>
            <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Eid offer" className={inputClasses} />
          </label>
          <label className="text-small">
            <span className="block text-ink-muted mb-1">Template</span>
            <select
              value={templateKey}
              onChange={(e) => {
                setTemplateKey(e.target.value);
                setParams([]);
              }}
              className={inputClasses}
            >
              {templates.map((t) => (
                <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                  {t.name} · {t.category.toLowerCase()} · {t.language}
                </option>
              ))}
            </select>
          </label>
        </div>

        {vars > 0 && (
          <div>
            <p className="text-tag text-ink-subtle mb-2">
              Type <code className="font-mono">{"{name}"}</code> to put each customer&apos;s first name in.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {values.map((v, i) => (
                <label key={i} className="text-small">
                  <span className="block text-ink-muted mb-1">{`{{${i + 1}}}`}</span>
                  <input
                    value={v}
                    onChange={(e) => setParams(values.map((x, j) => (j === i ? e.target.value : x)))}
                    placeholder={i === 0 ? "{name}" : ""}
                    className={inputClasses}
                  />
                </label>
              ))}
              {values.some((v) => /\{name\}/i.test(v)) && (
                <label className="text-small">
                  <span className="block text-ink-muted mb-1">If a contact has no name</span>
                  <input value={audience.nameFallback ?? ""} onChange={(e) => setA({ nameFallback: e.target.value })} className={inputClasses} />
                </label>
              )}
            </div>
          </div>
        )}

        <fieldset className="grid gap-4 rounded-xl border border-ink/10 p-4">
          <legend className="px-1 font-mono uppercase text-tag tracking-widest text-ink-subtle">Who gets it</legend>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => {
              const on = audience.statuses?.includes(s.value);
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() =>
                    setA({ statuses: on ? audience.statuses!.filter((x) => x !== s.value) : [...(audience.statuses ?? []), s.value] })
                  }
                  className={`rounded-full border px-3 py-1 text-small ${on ? "border-ink bg-ink text-cloud" : "border-ink/15 hover:bg-ink/5"}`}
                >
                  {s.label}
                </button>
              );
            })}
            <span className="text-tag text-ink-subtle self-center">{audience.statuses?.length ? "" : "All statuses"}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-small">
              <span className="block text-ink-muted mb-1">Tag</span>
              <select value={audience.tag ?? ""} onChange={(e) => setA({ tag: e.target.value })} className={inputClasses}>
                <option value="">Any tag</option>
                {tags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-small">
              <span className="block text-ink-muted mb-1">Came from</span>
              <select value={audience.source ?? ""} onChange={(e) => setA({ source: e.target.value })} className={inputClasses}>
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-small">
              <span className="block text-ink-muted mb-1">Last message</span>
              <select value={audience.activeDays ?? 0} onChange={(e) => setA({ activeDays: Number(e.target.value) })} className={inputClasses}>
                {ACTIVE.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-tag text-ink-subtle">Anyone who sent STOP is left out automatically.</p>
        </fieldset>

        <div className="flex flex-wrap items-end gap-4">
          <label className="text-small">
            <span className="block text-ink-muted mb-1">Send</span>
            <select value={when} onChange={(e) => setWhen(e.target.value as "now" | "later")} className={`${inputClasses} !w-auto`}>
              <option value="now">Now</option>
              <option value="later">Later (Pakistan time)</option>
            </select>
          </label>
          {when === "later" && (
            <label className="text-small">
              <span className="block text-ink-muted mb-1">Date &amp; time</span>
              <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className={`${inputClasses} !w-auto`} />
            </label>
          )}
        </div>

        {category === "MARKETING" && (
          <label className="flex items-start gap-2 text-small">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
            <span>
              These contacts agreed to get offers from us on WhatsApp.
              <span className="block text-tag text-ink-subtle">
                Meta requires opt-in for marketing. Messaging people who didn&apos;t ask gets blocks and reports, which lowers the number&apos;s
                quality and daily limit.
              </span>
            </span>
          </label>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={submit} disabled={pending} className={buttonStyles.primary}>
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Megaphone className="size-4" aria-hidden />}
            {when === "now" ? "Send broadcast" : "Schedule broadcast"}
          </button>
          {done && <p className="text-small text-forest">{done}</p>}
        </div>
        {error && <p className="text-small text-red-700">{error}</p>}
      </div>

      <div className="grid gap-4 lg:sticky lg:top-6">
        <div className="rounded-xl border border-ink/10 bg-white/60 p-4">
          <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">Audience</p>
          <p className="text-h3 font-medium tabular-nums">{preview ? preview.count.toLocaleString("en-US") : "…"}</p>
          <p className="text-small text-ink-muted">contacts{preview?.capped ? " (first 5,000 will be sent)" : ""}</p>
          {preview && preview.count > 0 && (
            <p className="text-small mt-2">
              Est. Meta cost ≈ <strong>Rs {Math.round(preview.usd * pkrRate * 1.045).toLocaleString("en-US")}</strong>
              <span className="block text-tag text-ink-subtle">
                ${preview.usd.toFixed(3)} at {category.toLowerCase()} rates, incl. ~4.5% bank fee + advance tax. Contacts inside a free window cost less.
              </span>
            </p>
          )}
        </div>
        {template && (
          <div>
            <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-2">Preview</p>
            <TemplatePreview header={template.header} body={fillVars(template.body, previewValues)} footer={template.footer} buttons={template.buttons} />
          </div>
        )}
      </div>
    </div>
  );
}

export function CancelBroadcastButton({ onCancel }: { onCancel: () => Promise<Result> }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Stop this broadcast? Messages already sent can't be recalled.")) return;
        start(async () => {
          await onCancel();
          router.refresh();
        });
      }}
      className="inline-flex items-center gap-1 text-tag text-red-700 hover:underline"
    >
      {pending ? <LoaderCircle className="size-3 animate-spin" aria-hidden /> : <X className="size-3" aria-hidden />} Stop
    </button>
  );
}
