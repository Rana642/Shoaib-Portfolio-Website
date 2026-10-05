"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, LoaderCircle, Printer, RefreshCw } from "lucide-react";
import { Field, buttonStyles, inputClasses } from "@/components/dashboard/ui";
import type { ReportSources } from "@/lib/dashboard/reports";

type Result = { error?: string; ok?: boolean } | undefined;

function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const run = (fn: () => Promise<Result>) => {
    setError(null);
    setSaved(false);
    start(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
      else setSaved(true);
    });
  };
  return { pending, error, saved, run };
}

/** Summary paragraph + refresh numbers + print/PDF. */
export function ReportControls({
  summary,
  locked,
  onSaveSummary,
  onRefresh,
}: {
  summary: string;
  locked: boolean;
  onSaveSummary: (summary: string) => Promise<Result>;
  onRefresh: () => Promise<Result>;
}) {
  const [text, setText] = useState(summary);
  const save = useAction();
  const refresh = useAction();

  return (
    <div className="space-y-5">
      <Field
        label="Summary for the client"
        htmlFor="report_summary"
        hint="A short paragraph at the top: what happened this month and what's next. Claude can draft it from the numbers below."
      >
        <textarea
          id="report_summary"
          rows={5}
          value={text}
          disabled={locked}
          onChange={(e) => setText(e.target.value)}
          className={inputClasses}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        {!locked && (
          <button type="button" disabled={save.pending} onClick={() => save.run(() => onSaveSummary(text))} className={buttonStyles.primary}>
            {save.pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />} Save summary
          </button>
        )}
        {!locked && (
          <button type="button" disabled={refresh.pending} onClick={() => refresh.run(onRefresh)} className={buttonStyles.secondary}>
            <RefreshCw className={`size-4 ${refresh.pending ? "animate-spin" : ""}`} aria-hidden /> Refresh numbers
          </button>
        )}
        <button type="button" onClick={() => window.print()} className={buttonStyles.secondary}>
          <Printer className="size-4" aria-hidden /> Print / PDF
        </button>
        {(save.saved || refresh.saved) && (
          <span className="inline-flex items-center gap-1.5 text-small text-green-700">
            <CheckCircle2 className="size-4" aria-hidden /> {refresh.saved ? "Numbers refreshed" : "Saved"}
          </span>
        )}
        {(save.error || refresh.error) && <span className="text-small text-red-700">{save.error ?? refresh.error}</span>}
      </div>
    </div>
  );
}

/** Per-project data sources (ad accounts, GA4). GBP + social are automatic. */
export function ReportSourcesForm({
  projectName,
  sources,
  errors,
  onSave,
}: {
  projectName: string;
  sources: ReportSources;
  errors: string[];
  onSave: (formData: FormData) => Promise<Result>;
}) {
  const action = useAction();
  return (
    <details className="rounded-lg border border-ink/10 p-4 group" open={errors.length > 0}>
      <summary className="cursor-pointer text-small font-medium">
        {projectName}
        {errors.length > 0 && <span className="ml-2 text-red-700">· {errors.length} source error{errors.length > 1 ? "s" : ""}</span>}
      </summary>
      {errors.length > 0 && (
        <ul className="mt-3 space-y-1 text-tag text-red-700">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <form
        action={(fd) => action.run(() => onSave(fd))}
        className="mt-4 grid gap-3 sm:grid-cols-2"
      >
        <Field label="Google Ads customer ID" htmlFor={`gads-${projectName}`}>
          <input id={`gads-${projectName}`} name="google_ads_customer_id" defaultValue={sources.google_ads_customer_id ?? ""} className={inputClasses} />
        </Field>
        <Field label="Google Ads manager (MCC) ID" htmlFor={`mcc-${projectName}`} hint="Only if the account sits under a manager.">
          <input id={`mcc-${projectName}`} name="google_ads_login_customer_id" defaultValue={sources.google_ads_login_customer_id ?? ""} className={inputClasses} />
        </Field>
        <Field label="Meta ad account" htmlFor={`meta-${projectName}`}>
          <input id={`meta-${projectName}`} name="meta_ad_account_id" defaultValue={sources.meta_ad_account_id ?? ""} placeholder="act_…" className={inputClasses} />
        </Field>
        <Field label="Meta campaigns containing" htmlFor={`metaf-${projectName}`} hint="When one ad account runs several brands.">
          <input id={`metaf-${projectName}`} name="meta_campaign_filter" defaultValue={sources.meta_campaign_filter ?? ""} className={inputClasses} />
        </Field>
        <Field label="GA4 property ID" htmlFor={`ga4-${projectName}`}>
          <input id={`ga4-${projectName}`} name="ga4_property_id" defaultValue={sources.ga4_property_id ?? ""} className={inputClasses} />
        </Field>
        <div className="flex items-end gap-3">
          <button type="submit" disabled={action.pending} className={buttonStyles.secondary}>
            {action.pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />} Save sources
          </button>
          {action.saved && <span className="text-small text-green-700">Saved. Refresh numbers to apply.</span>}
          {action.error && <span className="text-small text-red-700">{action.error}</span>}
        </div>
      </form>
    </details>
  );
}

/** "New report" — client + month. */
export function NewReportForm({
  clients,
  defaultPeriod,
  onCreate,
}: {
  clients: { id: string; name: string }[];
  defaultPeriod: string;
  onCreate: (formData: FormData) => Promise<Result>;
}) {
  const action = useAction();
  return (
    <form action={(fd) => action.run(() => onCreate(fd))} className="flex flex-wrap items-end gap-3">
      <Field label="Client" htmlFor="report_client">
        <select id="report_client" name="client_id" required className={inputClasses} defaultValue="">
          <option value="" disabled>
            Choose…
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Month" htmlFor="report_period">
        <input id="report_period" name="period" type="month" defaultValue={defaultPeriod} required className={inputClasses} />
      </Field>
      <button type="submit" disabled={action.pending} className={buttonStyles.primary}>
        {action.pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />} Build report
      </button>
      {action.error && <p className="w-full text-small text-red-700">{action.error}</p>}
    </form>
  );
}
