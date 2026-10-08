import "server-only";
import { db } from "./db";
import { periodLabel, todayPkt } from "./retainers";
import { googleAdsSearch } from "../google-ads-client";
import { metaMarketingRequest } from "../meta-marketing-client";
import { googleApiRequest } from "../google-api-passthrough";
import { gbpAccessToken } from "../gbp";
import { CONFIRMED_STATUSES, LOST_STATUSES, projectBookings } from "../hotel-bookings";

/**
 * Monthly client reports — billing phase 3 (docs/RETAINER-BILLING-PLAN.md).
 *
 * A report covers one client for one month. For each of the client's
 * projects it snapshots the KB work log (`client-report-log-YYYY-MM`, the
 * client-facing record of work done) plus that month's numbers from every
 * source the project has: Google Ads, Meta ads, GA4, Google Business
 * Profile and published social posts. Each source fails on its own — a
 * broken token costs one card, not the report — and errors are kept for
 * the dashboard only, never shown to the client.
 *
 * Not a "use server" file: called from authed actions and the billing cron.
 */

export type ReportSources = {
  google_ads_customer_id?: string;
  google_ads_login_customer_id?: string;
  meta_ad_account_id?: string;
  /** Only campaigns whose name contains this (one ad account, several brands). */
  meta_campaign_filter?: string;
  ga4_property_id?: string;
};

export type Metric = { label: string; value: number; kind?: "money" | "count" | "percent"; currency?: string };

export type ReportSection = {
  project_id: string;
  project_name: string;
  work_log: string | null;
  groups: { title: string; metrics: Metric[] }[];
  /** Dashboard-only: sources that couldn't be read. */
  errors: string[];
};

export type ClientReport = {
  id: string;
  client_id: string;
  period: string;
  status: "draft" | "sent";
  access_token: string;
  summary: string | null;
  sections: ReportSection[];
  generated_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

/** 'YYYY-MM' → first and last day; a month still running ends today. */
export function monthRange(period: string) {
  const [y, m] = period.split("-").map(Number);
  const start = `${period}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const today = todayPkt();
  return { start, end: last < today ? last : today };
}

/** The month before 'YYYY-MM'. */
export function previousPeriod(period: string) {
  const [y, m] = period.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;
const nonZero = (metrics: Metric[]) => metrics.filter((m) => m.value > 0);
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

async function googleAdsMetrics(src: ReportSources, start: string, end: string): Promise<Metric[]> {
  const res = (await googleAdsSearch(
    src.google_ads_customer_id!,
    `SELECT customer.currency_code, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
     FROM customer WHERE segments.date BETWEEN '${start}' AND '${end}'`,
    src.google_ads_login_customer_id || undefined
  )) as { results?: { customer?: { currencyCode?: string }; metrics?: Record<string, unknown> }[] };
  let cost = 0, impressions = 0, clicks = 0, conversions = 0;
  let currency = "PKR";
  for (const r of res.results ?? []) {
    currency = r.customer?.currencyCode ?? currency;
    cost += num(r.metrics?.costMicros) / 1e6;
    impressions += num(r.metrics?.impressions);
    clicks += num(r.metrics?.clicks);
    conversions += num(r.metrics?.conversions);
  }
  return [
    { label: "Ad spend", value: Math.round(cost), kind: "money", currency },
    { label: "Impressions", value: impressions },
    { label: "Clicks", value: clicks },
    { label: "Conversions", value: Math.round(conversions * 10) / 10 },
  ];
}

// Meta action types worth showing a client, in display order.
const META_ACTIONS: [string, string][] = [
  ["offsite_conversion.fb_pixel_purchase", "Bookings / purchases"],
  ["offsite_conversion.fb_pixel_lead", "Leads"],
  ["lead", "Leads"],
  ["offsite_conversion.fb_pixel_contact", "Website contacts"],
  ["onsite_conversion.messaging_conversation_started_7d", "Message conversations"],
  ["offsite_conversion.fb_pixel_initiate_checkout", "Booking starts"],
];

async function metaMetrics(src: ReportSources, start: string, end: string): Promise<Metric[]> {
  const account = src.meta_ad_account_id!.startsWith("act_") ? src.meta_ad_account_id! : `act_${src.meta_ad_account_id}`;
  const params: Record<string, unknown> = {
    fields: "spend,impressions,reach,inline_link_clicks,actions,account_currency",
    time_range: { since: start, until: end },
    level: "account",
  };
  if (src.meta_campaign_filter) {
    params.filtering = [{ field: "campaign.name", operator: "CONTAIN", value: src.meta_campaign_filter }];
  }
  const res = (await metaMarketingRequest(`${account}/insights`, "GET", params)) as {
    data?: { spend?: string; impressions?: string; reach?: string; inline_link_clicks?: string; account_currency?: string; actions?: { action_type: string; value: string }[] }[];
  };
  const row = res.data?.[0];
  if (!row) return [];
  const actions = new Map((row.actions ?? []).map((a) => [a.action_type, num(a.value)]));
  const seen = new Set<string>();
  const results: Metric[] = [];
  for (const [type, label] of META_ACTIONS) {
    const v = actions.get(type) ?? 0;
    if (v > 0 && !seen.has(label)) {
      seen.add(label);
      results.push({ label, value: v });
    }
  }
  return [
    { label: "Ad spend", value: Math.round(num(row.spend)), kind: "money", currency: row.account_currency ?? "PKR" },
    { label: "People reached", value: num(row.reach) },
    { label: "Impressions", value: num(row.impressions) },
    { label: "Link clicks", value: num(row.inline_link_clicks) },
    ...results,
  ];
}

// Real customer actions only, counted by event name — NOT GA4's keyEvents
// total, which counted page_view/first_visit as key events on some
// properties before the Oct 2026 cleanup and would inflate the report.
const GA4_ACTIONS: [string, string][] = [
  ["booking_confirmed", "Bookings"],
  ["purchase", "Bookings"],
  ["begin_checkout", "Booking starts"],
  ["generate_lead", "Enquiry forms"],
  ["form_submit", "Enquiry forms"],
  ["whatsapp_click", "WhatsApp taps"],
  ["phone_click", "Call taps"],
  ["call_click", "Call taps"],
  ["directions_click", "Direction taps"],
];

async function ga4Metrics(src: ReportSources, start: string, end: string): Promise<Metric[]> {
  const base = "https://analyticsdata.googleapis.com/v1beta";
  const path = `properties/${src.ga4_property_id}:runReport`;
  const dateRanges = [{ startDate: start, endDate: end }];
  const [traffic, events] = (await Promise.all([
    googleApiRequest("ga4", base, path, "POST", { dateRanges, metrics: [{ name: "totalUsers" }, { name: "sessions" }] }),
    googleApiRequest("ga4", base, path, "POST", {
      dateRanges,
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: { fieldName: "eventName", inListFilter: { values: GA4_ACTIONS.map(([name]) => name) } },
      },
    }),
  ])) as { rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[] }[];

  const v = traffic.rows?.[0]?.metricValues ?? [];
  const byLabel = new Map<string, number>();
  const label = new Map(GA4_ACTIONS);
  for (const row of events.rows ?? []) {
    const l = label.get(row.dimensionValues?.[0]?.value ?? "");
    if (l) byLabel.set(l, (byLabel.get(l) ?? 0) + num(row.metricValues?.[0]?.value));
  }
  const order = [...new Set(GA4_ACTIONS.map(([, l]) => l))];
  return [
    { label: "Visitors", value: num(v[0]?.value) },
    { label: "Visits", value: num(v[1]?.value) },
    ...order.map((l) => ({ label: l, value: byLabel.get(l) ?? 0 })),
  ];
}

const GBP_METRICS: [string, string][] = [
  ["BUSINESS_IMPRESSIONS_MOBILE_SEARCH", "views"],
  ["BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "views"],
  ["BUSINESS_IMPRESSIONS_MOBILE_MAPS", "views"],
  ["BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "views"],
  ["CALL_CLICKS", "calls"],
  ["BUSINESS_DIRECTION_REQUESTS", "directions"],
  ["WEBSITE_CLICKS", "website"],
];

async function gbpMetrics(projectId: string, location: string, start: string, end: string): Promise<Metric[]> {
  const token = await gbpAccessToken(projectId);
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const qs = new URLSearchParams();
  for (const [m] of GBP_METRICS) qs.append("dailyMetrics", m);
  qs.set("dailyRange.startDate.year", String(sy));
  qs.set("dailyRange.startDate.month", String(sm));
  qs.set("dailyRange.startDate.day", String(sd));
  qs.set("dailyRange.endDate.year", String(ey));
  qs.set("dailyRange.endDate.month", String(em));
  qs.set("dailyRange.endDate.day", String(ed));
  const res = await fetch(
    `https://businessprofileperformance.googleapis.com/v1/${location}:fetchMultiDailyMetricsTimeSeries?${qs}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const json = (await res.json()) as {
    multiDailyMetricTimeSeries?: { dailyMetricTimeSeries?: { dailyMetric: string; timeSeries?: { datedValues?: { value?: string }[] } }[] }[];
  };
  if (!res.ok) throw new Error(`GBP performance API error (${res.status}): ${JSON.stringify(json).slice(0, 200)}`);
  const totals: Record<string, number> = {};
  const kind = new Map(GBP_METRICS);
  for (const group of json.multiDailyMetricTimeSeries ?? []) {
    for (const series of group.dailyMetricTimeSeries ?? []) {
      const key = kind.get(series.dailyMetric) ?? series.dailyMetric;
      totals[key] = (totals[key] ?? 0) + (series.timeSeries?.datedValues ?? []).reduce((s, d) => s + num(d.value), 0);
    }
  }
  return [
    { label: "Profile views (Search + Maps)", value: totals.views ?? 0 },
    { label: "Calls", value: totals.calls ?? 0 },
    { label: "Direction requests", value: totals.directions ?? 0 },
    { label: "Website clicks", value: totals.website ?? 0 },
  ];
}

async function socialMetrics(projectId: string, start: string, end: string): Promise<Metric[]> {
  const { data } = await db
    .from("scheduled_posts")
    .select("post_type")
    .eq("project_id", projectId)
    .eq("status", "posted")
    .gte("posted_at", `${start}T00:00:00+05:00`)
    .lte("posted_at", `${end}T23:59:59+05:00`);
  const rows = data ?? [];
  const reels = rows.filter((r) => r.post_type === "reel").length;
  return [
    { label: "Posts published", value: rows.length - reels },
    { label: "Reels published", value: reels },
  ];
}

/**
 * The month's bookings (hotel website + WhatsApp, counted once) and WhatsApp
 * chats, plus confirmed/pending bookings per ad code — the numbers that show
 * whether the ads brought guests, not just clicks.
 */
async function bookingMetrics(projectId: string, start: string, end: string, waAccountIds: string[]) {
  const { rows, error } = await projectBookings(projectId, { since: `${start}T00:00:00+05:00`, until: `${end}T23:59:59+05:00` });
  if (error) throw new Error(error);
  const confirmed = rows.filter((r) => CONFIRMED_STATUSES.has(r.status));
  const pending = rows.filter((r) => !CONFIRMED_STATUSES.has(r.status) && !LOST_STATUSES.has(r.status));
  const lost = rows.filter((r) => LOST_STATUSES.has(r.status));

  let chats = 0;
  if (waAccountIds.length) {
    const { count } = await db
      .from("wa_contacts")
      .select("id", { count: "exact", head: true })
      .in("account_id", waAccountIds)
      .gte("created_at", `${start}T00:00:00+05:00`)
      .lte("created_at", `${end}T23:59:59+05:00`);
    chats = count ?? 0;
  }

  const bySource = new Map<string, number>();
  for (const r of [...confirmed, ...pending]) {
    const key = r.source ? `${r.source}${r.code ? ` · ${r.code}` : ""}` : r.channel === "whatsapp" ? "WhatsApp (no code)" : "Phone / walk-in";
    bySource.set(key, (bySource.get(key) ?? 0) + 1);
  }

  return {
    summary: [
      { label: "Confirmed bookings", value: confirmed.length },
      { label: "Confirmed booking value", value: Math.round(confirmed.reduce((s, r) => s + (r.amount ?? 0), 0)), kind: "money" as const, currency: "PKR" },
      { label: "Confirmed room nights", value: confirmed.reduce((s, r) => s + (r.nights ?? 0), 0) },
      { label: "Awaiting hotel confirmation", value: pending.length },
      { label: "Cancelled / no-show", value: lost.length },
      { label: "New WhatsApp chats", value: chats },
    ] as Metric[],
    bySource: [...bySource.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })) as Metric[],
  };
}

/** Everything for one project and month. */
export async function collectProjectSection(
  project: { id: string; name: string; report_sources: ReportSources | null },
  period: string
): Promise<ReportSection> {
  const { start, end } = monthRange(period);
  const src = project.report_sources ?? {};
  const errors: string[] = [];
  const groups: ReportSection["groups"] = [];

  const [{ data: log }, { data: gbp }] = await Promise.all([
    db
      .from("project_knowledge_docs")
      .select("content")
      .eq("project_id", project.id)
      .eq("slug", `client-report-log-${period}`)
      .maybeSingle(),
    db.from("gbp_connections").select("selected_location").eq("project_id", project.id).maybeSingle(),
  ]);

  const tasks: [string, () => Promise<Metric[]>][] = [];
  if (src.google_ads_customer_id) tasks.push(["Google Ads", () => googleAdsMetrics(src, start, end)]);
  if (src.meta_ad_account_id) tasks.push(["Facebook & Instagram ads", () => metaMetrics(src, start, end)]);
  if (src.ga4_property_id) tasks.push(["Website (Google Analytics)", () => ga4Metrics(src, start, end)]);
  if (gbp?.selected_location) tasks.push(["Google Business Profile", () => gbpMetrics(project.id, gbp.selected_location, start, end)]);
  tasks.push(["Social media", () => socialMetrics(project.id, start, end)]);
  // Hotels: bookings from the hotel's own system + WhatsApp, by ad code.
  const [{ data: bookingSource }, { data: waAccounts }] = await Promise.all([
    db.from("project_booking_sources").select("project_id").eq("project_id", project.id).maybeSingle(),
    db.from("wa_accounts").select("id").eq("project_id", project.id),
  ]);
  if (bookingSource || waAccounts?.length) {
    const booked = bookingMetrics(project.id, start, end, (waAccounts ?? []).map((a) => a.id as string));
    tasks.push(["Bookings", () => booked.then((b) => b.summary)]);
    tasks.push(["Bookings by source", () => booked.then((b) => b.bySource)]);
  }

  // One retry for network blips ("fetch failed") — API errors repeat anyway.
  const settled = await Promise.allSettled(tasks.map(([, run]) => run().catch(() => run())));
  settled.forEach((r, i) => {
    const title = tasks[i][0];
    if (r.status === "fulfilled") {
      const metrics = nonZero(r.value);
      if (metrics.length) groups.push({ title, metrics });
    } else {
      errors.push(`${title}: ${errorText(r.reason)}`);
    }
  });

  return {
    project_id: project.id,
    project_name: project.name,
    // Drop the doc's own title line — the report prints its own headings.
    work_log: log?.content ? log.content.replace(/^#\s.*\n+/, "").replace(/^Client-facing record.*\n+/m, "").trim() : null,
    groups,
    errors,
  };
}

/**
 * Create or refresh a client's report for a month. A sent report is never
 * touched (it's what the client saw); a draft's numbers are re-pulled and
 * Shoaib's summary is kept.
 */
export async function buildClientReport(
  clientId: string,
  period: string
): Promise<{ id: string; created: boolean } | { error: string }> {
  const { data: existing } = await db
    .from("client_reports")
    .select("id, status")
    .eq("client_id", clientId)
    .eq("period", period)
    .maybeSingle();
  if (existing?.status === "sent") return { error: "This report was already sent, so it can't be refreshed." };

  const { data: projects } = await db
    .from("client_projects")
    .select("id, name, report_sources")
    .eq("client_id", clientId)
    .order("sort_order");

  const sections = await Promise.all(
    (projects ?? []).map((p) => collectProjectSection(p as { id: string; name: string; report_sources: ReportSources }, period))
  );
  // A project with nothing to say this month stays out of the report.
  const useful = sections.filter((s) => s.work_log || s.groups.length || s.errors.length);

  const now = new Date().toISOString();
  if (existing) {
    const { error } = await db
      .from("client_reports")
      .update({ sections: useful, generated_at: now, updated_at: now })
      .eq("id", existing.id);
    return error ? { error: error.message } : { id: existing.id, created: false };
  }
  const { data, error } = await db
    .from("client_reports")
    .insert({ client_id: clientId, period, sections: useful, generated_at: now })
    .select("id")
    .single();
  if (error || !data) {
    const { data: race } = await db.from("client_reports").select("id").eq("client_id", clientId).eq("period", period).maybeSingle();
    return race ? { id: race.id, created: false } : { error: error?.message ?? "Couldn't create the report." };
  }
  return { id: data.id, created: true };
}

export { periodLabel };
