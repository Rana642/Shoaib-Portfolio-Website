import Link from "next/link";
import { db } from "@/lib/dashboard/db";
import { PageHeader, Card, StatusBadge } from "@/components/dashboard/ui";
import { InboxAutoRefresh, MarkRead, ReplyBox, ScrollToBottom, StatusSelect } from "@/components/dashboard/WhatsAppChat";
import { markWhatsAppRead, sendWhatsAppReply, setWhatsAppStatus } from "@/lib/dashboard/actions/whatsapp";
import { replyWindowOpen, verifyTokenFrom, whatsappCredential } from "@/lib/whatsapp";
import { siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp" };

type Contact = {
  id: string;
  wa_id: string;
  name: string | null;
  ref_source: string | null;
  ref_code: string | null;
  status: string;
  unread: number;
  last_message_at: string | null;
  last_inbound_at: string | null;
  wa_accounts: { label: string | null; display_phone: string | null } | null;
};

const SOURCE_LABEL: Record<string, string> = { FB: "Facebook/Instagram ad", GA: "Google ad", GS: "Google search", WEB: "Website" };

const time = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";

export default async function WhatsAppPage({ searchParams }: { searchParams: Promise<{ chat?: string }> }) {
  const { chat } = await searchParams;

  const [{ data: contactsData }, cred] = await Promise.all([
    db
      .from("wa_contacts")
      .select("id, wa_id, name, ref_source, ref_code, status, unread, last_message_at, last_inbound_at, wa_accounts(label, display_phone)")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200),
    whatsappCredential().catch(() => null),
  ]);
  const contacts = (contactsData ?? []) as unknown as Contact[];
  const active = contacts.find((c) => c.id === chat) ?? null;

  const { data: messages } = active
    ? await db
        .from("wa_messages")
        .select("id, direction, via, type, body, status, sent_at")
        .eq("contact_id", active.id)
        .order("sent_at", { ascending: true })
        .limit(500)
    : { data: [] };

  const windowOpen = replyWindowOpen(active?.last_inbound_at);

  async function reply(text: string) {
    "use server";
    return sendWhatsAppReply(active!.id, text);
  }
  async function changeStatus(status: string) {
    "use server";
    return setWhatsAppStatus(active!.id, status);
  }
  async function markRead() {
    "use server";
    await markWhatsAppRead(active!.id);
  }

  return (
    <>
      <InboxAutoRefresh />
      <PageHeader
        title="WhatsApp"
        description="Chats from connected WhatsApp numbers. The website's Ref code shows which ad each guest came from."
      />

      {contacts.length === 0 && cred && (
        <Card className="p-6 mb-6 max-w-3xl">
          <h2 className="text-body-lg font-medium mb-2">Connect the webhook</h2>
          <p className="text-small text-ink-muted mb-4">
            In the Socially Snap Meta app: WhatsApp → Configuration → Webhook → Edit. Paste these, then subscribe to the{" "}
            <code>messages</code> field (and <code>smb_message_echoes</code> once a hotel number joins).
          </p>
          <dl className="grid gap-2 text-small">
            <div>
              <dt className="text-ink-muted">Callback URL</dt>
              <dd className="font-mono break-all">{siteUrl}/api/whatsapp/webhook</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Verify token</dt>
              <dd className="font-mono break-all">{verifyTokenFrom(cred.app_secret)}</dd>
            </div>
          </dl>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="grid md:grid-cols-[320px_1fr] min-h-[560px]">
          {/* Chat list */}
          <ul className={`border-r border-ink/10 overflow-y-auto max-h-[70vh] ${active ? "hidden md:block" : ""}`}>
            {contacts.length === 0 && <li className="p-6 text-small text-ink-muted">No chats yet.</li>}
            {contacts.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/dashboard/whatsapp?chat=${c.id}`}
                  className={`block px-4 py-3 border-b border-ink/5 hover:bg-ink/[0.03] ${c.id === active?.id ? "bg-ink/[0.05]" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-small truncate">{c.name || `+${c.wa_id}`}</span>
                    <span className="text-tag text-ink-subtle shrink-0">{time(c.last_message_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {c.ref_source && (
                      <span className="font-mono text-tag rounded bg-citrus/20 px-1.5 py-0.5">
                        {c.ref_source}
                        {c.ref_code ? `-${c.ref_code}` : ""}
                      </span>
                    )}
                    <StatusBadge status={c.status} />
                    {c.unread > 0 && (
                      <span className="ml-auto text-tag font-semibold bg-forest text-white rounded-full px-2">{c.unread}</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Conversation */}
          {active ? (
            <section className="flex flex-col max-h-[70vh]">
              <MarkRead action={markRead} />
              <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-ink/10">
                <div>
                  <Link href="/dashboard/whatsapp" className="md:hidden text-tag text-ink-subtle">
                    ← All chats
                  </Link>
                  <p className="font-medium">{active.name || `+${active.wa_id}`}</p>
                  <p className="text-tag text-ink-muted">
                    +{active.wa_id}
                    {active.wa_accounts?.label || active.wa_accounts?.display_phone
                      ? ` · to ${active.wa_accounts?.label ?? active.wa_accounts?.display_phone}`
                      : ""}
                    {active.ref_source && ` · ${SOURCE_LABEL[active.ref_source] ?? active.ref_source}${active.ref_code ? ` (${active.ref_code})` : ""}`}
                  </p>
                </div>
                <StatusSelect status={active.status} onChange={changeStatus} />
              </header>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 bg-cloud/60">
                {(messages ?? []).map((m) => (
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
                <ScrollToBottom dep={(messages ?? []).length} />
              </div>

              <div className="border-t border-ink/10 p-4">
                <ReplyBox windowOpen={windowOpen} onSend={reply} />
              </div>
            </section>
          ) : (
            <div className="hidden md:flex items-center justify-center text-small text-ink-muted">Select a chat</div>
          )}
        </div>
      </Card>
    </>
  );
}
