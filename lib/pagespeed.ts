import "server-only";
import { getVaultCredential } from "./marketing-vault";

/**
 * Google PageSpeed Insights (v5). Needs only an API key from the API Vault
 * (service "pagespeed", field "api_key"): a Google Cloud API key with the
 * PageSpeed Insights API enabled. Read-only; the key never appears in output.
 */

const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export type PsiStrategy = "mobile" | "desktop";
export type PsiCategory = "performance" | "accessibility" | "best-practices" | "seo";

type Audit = { title?: string; displayValue?: string; numericValue?: number; score?: number | null; details?: { type?: string; overallSavingsMs?: number } };
type PsiResponse = {
  id?: string;
  analysisUTCTimestamp?: string;
  lighthouseResult?: {
    finalUrl?: string;
    categories?: Record<string, { score: number | null }>;
    audits?: Record<string, Audit>;
  };
  loadingExperience?: { overall_category?: string; metrics?: Record<string, { percentile?: number; category?: string }> };
  originLoadingExperience?: { overall_category?: string };
};

const LAB_METRICS: [string, string][] = [
  ["first-contentful-paint", "First Contentful Paint"],
  ["largest-contentful-paint", "Largest Contentful Paint"],
  ["total-blocking-time", "Total Blocking Time"],
  ["cumulative-layout-shift", "Cumulative Layout Shift"],
  ["speed-index", "Speed Index"],
  ["interactive", "Time to Interactive"],
];

const FIELD_METRICS: [string, string][] = [
  ["LARGEST_CONTENTFUL_PAINT_MS", "LCP"],
  ["INTERACTION_TO_NEXT_PAINT", "INP"],
  ["CUMULATIVE_LAYOUT_SHIFT_SCORE", "CLS"],
  ["FIRST_CONTENTFUL_PAINT_MS", "FCP"],
  ["EXPERIMENTAL_TIME_TO_FIRST_BYTE", "TTFB"],
];

/** The raw PSI response is huge; this keeps what decides a fix: scores, lab numbers, real-user (CrUX) data, top opportunities. */
export function summarizePsi(json: PsiResponse, strategy: PsiStrategy) {
  const lh = json.lighthouseResult;
  const scores = Object.fromEntries(Object.entries(lh?.categories ?? {}).map(([k, v]) => [k, v.score == null ? null : Math.round(v.score * 100)]));
  const audits = lh?.audits ?? {};
  const lab = Object.fromEntries(LAB_METRICS.filter(([id]) => audits[id]).map(([id, name]) => [name, audits[id].displayValue ?? audits[id].numericValue ?? null]));
  const crux = json.loadingExperience?.metrics ?? {};
  const field = Object.fromEntries(FIELD_METRICS.filter(([id]) => crux[id]).map(([id, name]) => [name, { p75: crux[id].percentile ?? null, rating: crux[id].category ?? null }]));
  const opportunities = Object.values(audits)
    .filter((a) => a.details?.type === "opportunity" && (a.details.overallSavingsMs ?? 0) > 100 && (a.score ?? 1) < 0.9)
    .sort((a, b) => (b.details?.overallSavingsMs ?? 0) - (a.details?.overallSavingsMs ?? 0))
    .slice(0, 8)
    .map((a) => ({ title: a.title, savingsMs: Math.round(a.details?.overallSavingsMs ?? 0), detail: a.displayValue ?? null }));
  return {
    url: lh?.finalUrl ?? json.id ?? null,
    strategy,
    analysedAt: json.analysisUTCTimestamp ?? null,
    scores,
    lab,
    realUsers: Object.keys(field).length ? { overall: json.loadingExperience?.overall_category ?? null, metrics: field } : "No real-user (CrUX) data for this URL yet (too little traffic).",
    topOpportunities: opportunities,
  };
}

export async function runPageSpeed(input: { url: string; strategy?: PsiStrategy; categories?: PsiCategory[] }) {
  const { api_key: key } = await getVaultCredential("pagespeed");
  if (!key) throw new Error("The 'pagespeed' credential has no 'api_key' field (API Vault).");
  const strategy = input.strategy ?? "mobile";
  const params = new URLSearchParams({ url: input.url, strategy });
  for (const c of input.categories?.length ? input.categories : (["performance"] as PsiCategory[])) params.append("category", c);
  params.set("key", key);

  const res = await fetch(`${PSI_ENDPOINT}?${params}`, { signal: AbortSignal.timeout(90_000) });
  const text = await res.text();
  if (!res.ok) {
    // Never echo the request URL (it carries the key); the API's own message is enough.
    let message = text.slice(0, 300);
    try {
      message = JSON.parse(text)?.error?.message ?? message;
    } catch {
      /* keep raw text */
    }
    throw new Error(`PageSpeed Insights ${res.status}: ${message}`);
  }
  return summarizePsi(JSON.parse(text) as PsiResponse, strategy);
}
