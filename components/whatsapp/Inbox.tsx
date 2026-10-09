import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { Card, StatusBadge } from "@/components/dashboard/ui";
import {
  BookingForm,
  HandoffButton,
  InboxAutoRefresh,
  InboxFilters,
  MarkRead,
  NotesBox,
  ReplyBox,
  ScrollToBottom,
  StatusSelect,
  TagEditor,
  type BookingDetails,
} from "@/components/dashboard/WhatsAppChat";
import { chatStage, replyWindowOpen, type ChatPatch, type ChatStage } from "@/lib/whatsapp";

/**
 * The WhatsApp live chat — one component for my dashboard (every business)
 * and the client portal (only the signed-in client's numbers). Laid out like
 * AiSensy's Live Chat: chat list with Active / Requesting / Intervened tabs,
 * the conversation, and a Guest Profile panel (source, status, booking, tags,
 * notes). The caller decides which WhatsApp accounts are visible and passes
 * server actions that re-check access themselves; nothing here trusts the URL.
 */

type Contact = {
  id: string;
  account_id: string;
  wa_id: string;
  name: string | null;
  ref_source: string | null;
  ref_code: string | null;
  status: string;
  unread: number;
  last_message_at: string | null;
  last_inbound_at: string | null;
  booking: BookingDetails | null;
  intervened_at: string | null;
  resolved_at: string | null;
  opted_out_at: string | null;
  tags: string[] | null;
  notes: string | null;
  created_at: string;
};

export type InboxAccount = { id: string; name: string };

type Result = { error?: string; ok?: boolean } | undefined;

const SOURCE_LABEL: Record<string, string> = { FB: "Facebook/Instagram ad", GA: "Google ad", GS: "Google search", WEB: "Website" };
const SOURCES = [...Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label })), { value: "none", label: "No code" }];

const TABS: { stage: ChatStage; label: string; hint: string }[] = [
  { stage: "active", label: "Active", hint: "Automation is handling these" },
  { stage: "requesting", label: "Requesting", hint: "Guest waiting 15+ min, or a booking request" },
  { stage: "intervened", label: "Intervened", hint: "Your team took over — automation paused" },
];

const time = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";

const initials = (c: Contact) =>
  (c.name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "#";

function waiting(iso: string | null) {
  if (!iso) return "";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${min % 60}m`;
}

function windowLeft(iso: string | null) {
  if (!replyWindowOpen(iso)) return null;
  const ms = 24 * 3600 * 1000 - (Date.now() - new Date(iso!).getTime());
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

export default async function Inbox({
  accounts,
  basePath,
  query,
  chatId,
  tab,
  search,
  source,
  actions,
}: {
  /** The WhatsApp numbers this viewer may see (already access-checked). */
  accounts: InboxAccount[];
  /** e.g. "/dashboard/whatsapp" or "/portal/whatsapp" */
  basePath: string;
  /** Other query params to keep on chat links, e.g. "account=…" or "project=…". */
  query?: string;
  chatId?: string;
  tab?: string;
  search?: string;
  source?: string;
  actions: {
    reply: (contactId: string, text: string) => Promise<Result>;
    setStatus: (contactId: string, status: string) => Promise<Result>;
    markRead: (contactId: string) => Promise<void>;
    saveBooking: (contactId: string, formData: FormData) => Promise<Result>;
    update: (contactId: string, patch: ChatPatch) => Promise<Result>;
  };
}) {
  const accountIds = accounts.map((a) => a.id);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));

  let list = accountIds.length
    ? db
        .from("wa_contacts")
        .select(
          "id, account_id, wa_id, name, ref_source, ref_code, status, unread, last_message_at, last_inbound_at, booking, intervened_at, resolved_at, opted_out_at, tags, notes, created_at"
        )
        .in("account_id", accountIds)
    : null;
  const q = search?.replace(/[^\p{L}\p{N} +]/gu, "").trim();
  if (list && q) {
    const digits = q.replace(/\D/g, "");
    list = list.or(digits.length >= 3 ? `name.ilike.%${q}%,wa_id.ilike.%${digits}%` : `name.ilike.%${q}%`);
  }
  if (list && source) list = source === "none" ? list.is("ref_source", null) : list.eq("ref_source", source);
  const { data } = list ? await list.order("last_message_at", { ascending: false, nullsFirst: false }).limit(300) : { data: [] };

  const contacts = (data ?? []) as Contact[];
  const staged = contacts.map((c) => ({ ...c, stage: chatStage(c) }));
  const counts = { active: 0, requesting: 0, intervened: 0 } as Record<ChatStage, number>;
  for (const c of staged) counts[c.stage]++;
  const currentTab: ChatStage = TABS.some((t) => t.stage === tab) ? (tab as ChatStage) : "active";
  const shown = staged.filter((c) => c.stage === currentTab);

  // The open chat (may sit in another tab, or outside the search).
  let active = staged.find((c) => c.id === chatId) ?? null;
  if (!active && chatId && accountIds.length) {
    const { data: one } = await db
      .from("wa_contacts")
      .select(
        "id, account_id, wa_id, name, ref_source, ref_code, status, unread, last_message_at, last_inbound_at, booking, intervened_at, resolved_at, opted_out_at, tags, notes, created_at"
      )
      .eq("id", chatId)
      .in("account_id", accountIds)
      .maybeSingle();
    if (one) active = { ...(one as Contact), stage: chatStage(one as Contact) };
  }

  const [{ data: messages }, { data: quickReplies }] = active
    ? await Promise.all([
        db
          .from("wa_messages")
          .select("id, direction, via, type, body, status, sent_at")
          .eq("contact_id", active.id)
          .order("sent_at", { ascending: false })
          .limit(500),
        db.from("wa_quick_replies").select("id, title, body").eq("account_id", active.account_id).order("sort_order"),
      ])
    : [{ data: [] }, { data: [] }];
  const thread = (messages ?? []).reverse();

  const href = (opts: { chat?: string; tab?: string }) => {
    const p = new URLSearchParams(query ?? "");
    if (search) p.set("q", search);
    if (source) p.set("src", source);
    const t = opts.tab ?? currentTab;
    if (t !== "active") p.set("tab", t);
    if (opts.chat) p.set("chat", opts.chat);
    const s = p.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const showBusiness = accounts.length > 1;

  const profile = active && (
    <GuestProfile
      contact={active}
      business={showBusiness ? accountName.get(active.account_id) : undefined}
      actions={actions}
    />
  );

  return (
    <Card className="overflow-hidden flex flex-col h-[calc(100dvh-7rem)] min-h-[560px]">
      <InboxAutoRefresh />
      {/* Top bar: search + source filter */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-ink/10">
        <InboxFilters sources={SOURCES} />
      </div>

      {/* Tabs band */}
      <div className="grid md:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_300px] bg-ink text-cloud">
        <nav className="flex" aria-label="Chat stages">
          {TABS.map((t) => (
            <Link
              key={t.stage}
              href={href({ tab: t.stage, chat: active?.id })}
              title={t.hint}
              className={`flex-1 text-center whitespace-nowrap px-1 py-3 font-mono uppercase text-[11px] tracking-wide border-b-2 ${
                currentTab === t.stage ? "border-citrus text-cloud" : "border-transparent text-cloud/60 hover:text-cloud"
              }`}
            >
              {t.label} ({counts[t.stage]})
            </Link>
          ))}
        </nav>
        <div className="hidden md:block" />
        <p className="hidden xl:flex items-center justify-center text-small font-medium">Guest Profile</p>
      </div>

      <div className="flex-1 min-h-0 grid md:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_300px]">
        {/* Chat list */}
        <ul className={`border-r border-ink/10 overflow-y-auto min-h-0 ${active ? "hidden md:block" : ""}`}>
          {shown.length === 0 && (
            <li className="p-8 text-center text-small text-ink-muted">
              <MessageCircle className="size-10 mx-auto mb-3 text-forest/60" aria-hidden />
              {q || source ? "No chats match." : "Seems clear!"}
            </li>
          )}
          {shown.map((c) => (
            <li key={c.id}>
              <Link
                href={href({ chat: c.id })}
                className={`flex gap-3 px-4 py-3 border-b border-ink/5 hover:bg-ink/[0.03] ${c.id === active?.id ? "bg-ink/[0.05]" : ""}`}
              >
                <span className="size-9 shrink-0 rounded-full bg-forest/15 text-forest font-medium text-small flex items-center justify-center">
                  {initials(c)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium text-small truncate">{c.name || `+${c.wa_id}`}</span>
                    <span className="text-tag text-ink-subtle shrink-0">{time(c.last_message_at)}</span>
                  </span>
                  {showBusiness && <span className="block text-tag text-ink-subtle truncate">{accountName.get(c.account_id)}</span>}
                  <span className="flex flex-wrap items-center gap-1.5 mt-1">
                    {c.ref_source && (
                      <span className="font-mono text-tag rounded bg-citrus/20 px-1.5 py-0.5">
                        {c.ref_source}
                        {c.ref_code ? `-${c.ref_code}` : ""}
                      </span>
                    )}
                    <StatusBadge status={c.status} />
                    {c.stage === "requesting" && <span className="text-tag text-red-700">waiting {waiting(c.last_inbound_at)}</span>}
                    {c.unread > 0 && <span className="ml-auto text-tag font-semibold bg-forest text-white rounded-full px-2">{c.unread}</span>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {/* Conversation */}
        {active ? (
          <section className="flex flex-col min-h-0">
            <MarkRead key={active.id} action={actions.markRead.bind(null, active.id)} />
            <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-ink/10">
              <div className="flex items-center gap-3 min-w-0">
                <Link href={href({})} className="md:hidden text-small text-ink-subtle" aria-label="All chats">
                  ←
                </Link>
                <span className="size-9 shrink-0 rounded-full bg-forest/15 text-forest font-medium text-small flex items-center justify-center">
                  {initials(active)}
                </span>
                <div className="min-w-0">
                  <p className="font-medium truncate">{active.name || `+${active.wa_id}`}</p>
                  <p className="text-tag text-ink-muted truncate">
                    +{active.wa_id}
                    {showBusiness && ` · ${accountName.get(active.account_id)}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">{active.stage}</span>
                <HandoffButton intervened={active.stage === "intervened"} onUpdate={actions.update.bind(null, active.id)} />
              </div>
            </header>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-2 bg-citrus/[0.06]">
              {thread.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-xl px-3.5 py-2 text-small whitespace-pre-wrap break-words ${
                      m.direction === "out" ? "bg-forest/15" : "bg-white border border-ink/10"
                    }`}
                  >
                    {m.body ?? <span className="italic text-ink-muted">[{m.type}]</span>}
                    <span className="block text-right text-[10px] text-ink-subtle mt-1">
                      {time(m.sent_at)}
                      {m.direction === "out" &&
                        ` · ${m.via === "app" ? "phone" : m.via === "auto" ? "auto-reply" : "dashboard"}${m.status ? ` · ${m.status}` : ""}`}
                    </span>
                  </div>
                </div>
              ))}
              <ScrollToBottom dep={thread.length} />
            </div>

            {/* Guest details on screens without the side panel */}
            <details className="xl:hidden border-t border-ink/10">
              <summary className="px-5 py-2 text-small cursor-pointer">Guest profile</summary>
              <div className="max-h-[45vh] overflow-y-auto">{profile}</div>
            </details>

            <div className="border-t border-ink/10 p-4">
              {active.opted_out_at && (
                <p className="text-small text-red-700 mb-2">
                  This guest sent STOP on {time(active.opted_out_at)} — automation won&apos;t message them. Only reply if they ask something.
                </p>
              )}
              <ReplyBox
                key={active.id}
                windowOpen={replyWindowOpen(active.last_inbound_at)}
                onSend={actions.reply.bind(null, active.id)}
                quickReplies={quickReplies ?? []}
              />
            </div>
          </section>
        ) : (
          <div className="hidden md:flex flex-col items-center justify-center gap-3 bg-citrus/[0.06] text-ink-muted">
            <MessageCircle className="size-12 text-forest/50" aria-hidden />
            <p className="text-body">Select a chat to continue</p>
          </div>
        )}

        {/* Guest Profile */}
        <aside className="hidden xl:block border-l border-ink/10 overflow-y-auto min-h-0">
          {profile ?? (
            <p className="p-6 text-small text-ink-muted text-center">Open a chat to see the guest&apos;s details.</p>
          )}
        </aside>
      </div>
    </Card>
  );
}

function GuestProfile({
  contact: c,
  business,
  actions,
}: {
  contact: Contact & { stage: ChatStage };
  business?: string;
  actions: {
    setStatus: (contactId: string, status: string) => Promise<Result>;
    saveBooking: (contactId: string, formData: FormData) => Promise<Result>;
    update: (contactId: string, patch: ChatPatch) => Promise<Result>;
  };
}) {
  const left = windowLeft(c.last_inbound_at);
  return (
    <div>
      <div className="px-5 py-5 text-center border-b border-ink/10">
        <span className="size-14 mx-auto rounded-full bg-forest/15 text-forest font-medium text-body-lg flex items-center justify-center">
          {initials(c)}
        </span>
        <p className="font-medium mt-2">{c.name || "Unknown name"}</p>
        <p className="text-small text-ink-muted">+{c.wa_id}</p>
        {business && <p className="text-tag text-ink-subtle mt-0.5">{business}</p>}
      </div>

      <Section title="Came from">
        {c.ref_source ? (
          <p className="text-small">
            {SOURCE_LABEL[c.ref_source] ?? c.ref_source}
            {c.ref_code && <span className="ml-2 font-mono text-tag rounded bg-citrus/20 px-1.5 py-0.5">{c.ref_code}</span>}
          </p>
        ) : (
          <p className="text-small text-ink-muted">No Ref code — direct message</p>
        )}
        <p className="text-tag text-ink-subtle mt-1">First message {time(c.created_at)}</p>
      </Section>

      <Section title="Status">
        <StatusSelect key={c.id} status={c.status} onChange={actions.setStatus.bind(null, c.id)} />
      </Section>

      <Section title="Booking">
        <BookingForm
          key={`b-${c.id}`}
          compact
          booking={c.booking}
          booked={c.status === "booked"}
          onSave={actions.saveBooking.bind(null, c.id)}
        />
      </Section>

      <Section title="Tags">
        <TagEditor key={`t-${c.id}`} tags={c.tags ?? []} onUpdate={actions.update.bind(null, c.id)} />
      </Section>

      <Section title="Notes">
        <NotesBox key={`n-${c.id}`} notes={c.notes} onUpdate={actions.update.bind(null, c.id)} />
      </Section>

      <Section title="Reply window">
        <p className="text-small">{left ? `${left} left for free replies` : "Closed — the guest has to message first"}</p>
        {c.opted_out_at && <p className="text-small text-red-700 mt-1">Opted out (STOP)</p>}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-5 py-4 border-b border-ink/10">
      <h3 className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-2">{title}</h3>
      {children}
    </section>
  );
}
