import Link from "next/link";
import { db } from "@/lib/dashboard/db";
import { Card, StatusBadge } from "@/components/dashboard/ui";
import { BookingForm, InboxAutoRefresh, MarkRead, ReplyBox, ScrollToBottom, StatusSelect, type BookingDetails } from "@/components/dashboard/WhatsAppChat";
import { replyWindowOpen } from "@/lib/whatsapp";

/**
 * The WhatsApp inbox — one component for my dashboard (every business) and
 * the client portal (only the signed-in client's numbers). The caller
 * decides which WhatsApp accounts are visible and passes server actions
 * that re-check access themselves; nothing here trusts the URL.
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
};

export type InboxAccount = { id: string; name: string };

type Result = { error?: string; ok?: boolean } | undefined;

const SOURCE_LABEL: Record<string, string> = { FB: "Facebook/Instagram ad", GA: "Google ad", GS: "Google search", WEB: "Website" };

const time = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";

export default async function Inbox({
  accounts,
  basePath,
  query,
  chatId,
  actions,
}: {
  /** The WhatsApp numbers this viewer may see (already access-checked). */
  accounts: InboxAccount[];
  /** e.g. "/dashboard/whatsapp" or "/portal/whatsapp" */
  basePath: string;
  /** Other query params to keep on chat links, e.g. "account=…" or "project=…". */
  query?: string;
  chatId?: string;
  actions: {
    reply: (contactId: string, text: string) => Promise<Result>;
    setStatus: (contactId: string, status: string) => Promise<Result>;
    markRead: (contactId: string) => Promise<void>;
    saveBooking: (contactId: string, formData: FormData) => Promise<Result>;
  };
}) {
  const accountIds = accounts.map((a) => a.id);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));

  const { data } = accountIds.length
    ? await db
        .from("wa_contacts")
        .select("id, account_id, wa_id, name, ref_source, ref_code, status, unread, last_message_at, last_inbound_at, booking")
        .in("account_id", accountIds)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(200)
    : { data: [] };
  const contacts = (data ?? []) as Contact[];
  const active = contacts.find((c) => c.id === chatId) ?? null;

  const { data: messages } = active
    ? await db
        .from("wa_messages")
        .select("id, direction, via, type, body, status, sent_at")
        .eq("contact_id", active.id)
        .order("sent_at", { ascending: false })
        .limit(500)
    : { data: [] };
  const thread = (messages ?? []).reverse();

  const href = (id?: string) => {
    const params = [query, id ? `chat=${id}` : ""].filter(Boolean).join("&");
    return params ? `${basePath}?${params}` : basePath;
  };
  const showBusiness = accounts.length > 1;

  return (
    <Card className="overflow-hidden">
      <InboxAutoRefresh />
      <div className="grid md:grid-cols-[320px_1fr] min-h-[560px]">
        {/* Chat list */}
        <ul className={`border-r border-ink/10 overflow-y-auto max-h-[70vh] ${active ? "hidden md:block" : ""}`}>
          {contacts.length === 0 && <li className="p-6 text-small text-ink-muted">No chats yet.</li>}
          {contacts.map((c) => (
            <li key={c.id}>
              <Link
                href={href(c.id)}
                className={`block px-4 py-3 border-b border-ink/5 hover:bg-ink/[0.03] ${c.id === active?.id ? "bg-ink/[0.05]" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-small truncate">{c.name || `+${c.wa_id}`}</span>
                  <span className="text-tag text-ink-subtle shrink-0">{time(c.last_message_at)}</span>
                </div>
                {showBusiness && <p className="text-tag text-ink-subtle truncate">{accountName.get(c.account_id)}</p>}
                <div className="flex items-center gap-2 mt-1">
                  {c.ref_source && (
                    <span className="font-mono text-tag rounded bg-citrus/20 px-1.5 py-0.5">
                      {c.ref_source}
                      {c.ref_code ? `-${c.ref_code}` : ""}
                    </span>
                  )}
                  <StatusBadge status={c.status} />
                  {c.unread > 0 && <span className="ml-auto text-tag font-semibold bg-forest text-white rounded-full px-2">{c.unread}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>

        {/* Conversation */}
        {active ? (
          <section className="flex flex-col max-h-[70vh]">
            <MarkRead key={active.id} action={actions.markRead.bind(null, active.id)} />
            <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-ink/10">
              <div>
                <Link href={href()} className="md:hidden text-tag text-ink-subtle">
                  ← All chats
                </Link>
                <p className="font-medium">{active.name || `+${active.wa_id}`}</p>
                <p className="text-tag text-ink-muted">
                  +{active.wa_id}
                  {showBusiness && ` · ${accountName.get(active.account_id)}`}
                  {active.ref_source &&
                    ` · ${SOURCE_LABEL[active.ref_source] ?? active.ref_source}${active.ref_code ? ` (${active.ref_code})` : ""}`}
                </p>
              </div>
              <StatusSelect key={active.id} status={active.status} onChange={actions.setStatus.bind(null, active.id)} />
              <BookingForm
                key={`b-${active.id}`}
                booking={active.booking}
                booked={active.status === "booked"}
                onSave={actions.saveBooking.bind(null, active.id)}
              />
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 bg-cloud/60">
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
                      {m.direction === "out" && ` · ${m.via === "app" ? "phone" : "dashboard"}${m.status ? ` · ${m.status}` : ""}`}
                    </span>
                  </div>
                </div>
              ))}
              <ScrollToBottom dep={thread.length} />
            </div>

            <div className="border-t border-ink/10 p-4">
              <ReplyBox key={active.id} windowOpen={replyWindowOpen(active.last_inbound_at)} onSend={actions.reply.bind(null, active.id)} />
            </div>
          </section>
        ) : (
          <div className="hidden md:flex items-center justify-center text-small text-ink-muted">Select a chat</div>
        )}
      </div>
    </Card>
  );
}
