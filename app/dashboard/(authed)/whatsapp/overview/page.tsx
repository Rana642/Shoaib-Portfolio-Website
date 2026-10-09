import Link from "next/link";
import { db } from "@/lib/dashboard/db";
import { Card, PageHeader } from "@/components/dashboard/ui";
import MessagesChart from "@/components/whatsapp/MessagesChart";
import { chatStage, replyWindowOpen } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp overview" };

type Stats = {
  conversations: number;
  new_contacts: number;
  received: number;
  sent_staff: number;
  sent_auto: number;
  sent_template: number;
  sent_broadcast: number;
  turns: number;
  turns_answered: number;
  median_reply_min: number | null;
  won: number;
  revenue: number;
  sources: Record<string, number>;
  daily: { day: string; in: number; out: number }[];
  broadcasts: { count: number; sent: number; delivered: number; read: number; failed: number };
};

const PERIODS = [7, 30, 90];
const SOURCE_LABEL: Record<string, string> = {
  FB: "Facebook/Instagram ad",
  GA: "Google ad",
  GS: "Google search",
  WEB: "Website",
  none: "No code (direct)",
};
/** ISO time `days` days ago (kept outside the component: render must stay pure). */
const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
const n = (v: number) => v.toLocaleString("en-US");
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
function minutes(m: number | null) {
  if (m === null) return "—";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
}

/** Every day in the period (PKT), so quiet days still show as empty columns. */
function fillDays(daily: Stats["daily"], days: number) {
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const out: Stats["daily"] = [];
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" }));
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString("en-CA");
    out.push(byDay.get(key) ?? { day: key, in: 0, out: 0 });
  }
  return out;
}

function Tile({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <>
      <p className="text-tag text-ink-subtle">{label}</p>
      <p className="text-h3 font-medium tabular-nums mt-1">{value}</p>
      {sub && <p className="text-tag text-ink-muted mt-0.5">{sub}</p>}
    </>
  );
  return (
    <Card className="p-4">
      {href ? (
        <Link href={href} className="block hover:opacity-80">
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  );
}

/** WhatsApp at a glance: what needs a person right now, and how the period went. */
export default async function WhatsAppOverviewPage({ searchParams }: { searchParams: Promise<{ days?: string; account?: string }> }) {
  const { days: daysParam, account } = await searchParams;
  const days = PERIODS.includes(Number(daysParam)) ? Number(daysParam) : 30;

  const { data: rows } = await db.from("wa_accounts").select("id, label, display_phone, client_projects(name)").order("created_at");
  const accounts = ((rows ?? []) as unknown as { id: string; label: string | null; display_phone: string | null; client_projects: { name: string } | null }[]).map(
    (a) => ({ id: a.id, name: a.client_projects?.name ?? a.label ?? a.display_phone ?? "WhatsApp" })
  );
  const ids = account && accounts.some((a) => a.id === account) ? [account] : accounts.map((a) => a.id);
  const since = daysAgo(days);

  const [{ data: statData }, { data: contacts }] = ids.length
    ? await Promise.all([
        db.rpc("wa_overview_stats", { account_ids: ids, since }),
        db
          .from("wa_contacts")
          .select("intervened_at, resolved_at, last_inbound_at, ref_source, status, unread")
          .in("account_id", ids)
          .gte("last_inbound_at", daysAgo(1)),
      ])
    : [{ data: null }, { data: [] }];
  const s = statData as Stats | null;

  const recent = (contacts ?? []) as {
    intervened_at: string | null;
    resolved_at: string | null;
    last_inbound_at: string | null;
    ref_source: string | null;
    status: string;
    unread: number;
  }[];
  const waiting = recent.filter((c) => chatStage(c) === "requesting").length;
  const unread = recent.reduce((t, c) => t + (c.unread ?? 0), 0);
  const open = recent.filter((c) => replyWindowOpen(c.last_inbound_at)).length;

  const q = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { days: String(days), account, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/dashboard/whatsapp/overview?${p}`;
  };
  const sent = s ? s.sent_staff + s.sent_auto + s.sent_template + s.sent_broadcast : 0;
  const sources = Object.entries(s?.sources ?? {}).sort((a, b) => b[1] - a[1]);
  const sourceMax = Math.max(1, ...sources.map(([, v]) => v));

  return (
    <>
      <PageHeader title="Overview" description="What needs a person right now, and how WhatsApp did over the period." />

      <div className="flex flex-wrap items-center gap-2 mb-6 text-small">
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={q({ days: String(p) })}
            className={`rounded-lg border px-3 py-1.5 ${p === days ? "border-ink bg-ink text-cloud" : "border-ink/15 hover:bg-ink/5"}`}
          >
            Last {p} days
          </Link>
        ))}
        {accounts.length > 1 && (
          <>
            <span className="mx-2 h-5 border-l border-ink/15" aria-hidden />
            <Link
              href={q({ account: undefined })}
              className={`rounded-lg border px-3 py-1.5 ${!account ? "border-ink bg-ink text-cloud" : "border-ink/15 hover:bg-ink/5"}`}
            >
              All numbers
            </Link>
            {accounts.map((a) => (
              <Link
                key={a.id}
                href={q({ account: a.id })}
                className={`rounded-lg border px-3 py-1.5 ${account === a.id ? "border-ink bg-ink text-cloud" : "border-ink/15 hover:bg-ink/5"}`}
              >
                {a.name}
              </Link>
            ))}
          </>
        )}
      </div>

      {!ids.length || !s ? (
        <Card className="p-6">
          <p className="text-small text-ink-muted">No WhatsApp number connected yet — connect one under Numbers.</p>
        </Card>
      ) : (
        <div className="grid gap-6">
          <section>
            <h2 className="text-tag text-ink-subtle mb-2">Right now</h2>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
              <Tile label="Waiting for a person" value={n(waiting)} sub="Requesting tab" href="/dashboard/whatsapp?tab=requesting" />
              <Tile label="Unread messages" value={n(unread)} href="/dashboard/whatsapp" />
              <Tile label="Chats you can reply to free" value={n(open)} sub="inside the 24-hour window" />
            </div>
          </section>

          <section>
            <h2 className="text-tag text-ink-subtle mb-2">Last {days} days</h2>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <Tile label="Conversations" value={n(s.conversations)} sub={`${n(s.new_contacts)} new contacts`} />
              <Tile label="Messages received" value={n(s.received)} />
              <Tile
                label="Messages sent"
                value={n(sent)}
                sub={`${n(s.sent_staff)} team · ${n(s.sent_auto)} auto · ${n(s.sent_template + s.sent_broadcast)} template`}
              />
              <Tile label="Median reply time" value={minutes(s.median_reply_min)} sub="customer message → team reply" />
              <Tile label="Answered" value={pct(s.turns_answered, s.turns)} sub={`${n(s.turns_answered)} of ${n(s.turns)} within 24 h`} />
              <Tile label="Won / booked" value={n(s.won)} sub={s.revenue ? `Rs ${n(Math.round(s.revenue))}` : undefined} />
            </div>
          </section>

          <Card className="p-6">
            <h2 className="text-body-lg font-medium mb-4">Messages per day</h2>
            <MessagesChart days={fillDays(s.daily, days)} />
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-6">
              <h2 className="text-body-lg font-medium mb-1">Where new contacts came from</h2>
              <p className="text-tag text-ink-subtle mb-4">From the website&apos;s Ref code or the Click-to-WhatsApp ad.</p>
              {sources.length === 0 ? (
                <p className="text-small text-ink-muted">No new contacts in this period.</p>
              ) : (
                <ul className="grid gap-2.5">
                  {sources.map(([k, v]) => (
                    <li key={k} className="grid grid-cols-[160px_1fr_auto] items-center gap-3 text-small">
                      <span className="truncate">{SOURCE_LABEL[k] ?? k}</span>
                      <span className="h-2.5 rounded-r-[4px] bg-cobalt" style={{ width: `${(v / sourceMax) * 100}%` }} aria-hidden />
                      <span className="tabular-nums text-ink-muted">{n(v)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-6">
              <h2 className="text-body-lg font-medium mb-1">Broadcasts</h2>
              <p className="text-tag text-ink-subtle mb-4">
                {n(s.broadcasts.count)} broadcast{s.broadcasts.count === 1 ? "" : "s"} in this period.
              </p>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-small">
                {[
                  ["Sent", n(s.broadcasts.sent)],
                  ["Delivered", `${n(s.broadcasts.delivered)} · ${pct(s.broadcasts.delivered, s.broadcasts.sent)}`],
                  ["Read", `${n(s.broadcasts.read)} · ${pct(s.broadcasts.read, s.broadcasts.sent)}`],
                  ["Failed", n(s.broadcasts.failed)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-tag text-ink-subtle">{k}</dt>
                    <dd className="font-medium tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              <Link href="/dashboard/whatsapp/broadcasts" className="inline-block mt-4 text-small underline underline-offset-4">
                All broadcasts
              </Link>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
