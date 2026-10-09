import Link from "next/link";
import { Calculator, FileText, Megaphone, Zap } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { Card } from "@/components/dashboard/ui";
import Inbox, { type InboxAccount } from "@/components/whatsapp/Inbox";
import ConnectWhatsApp from "@/components/whatsapp/ConnectWhatsApp";
import NumbersPopover from "@/components/whatsapp/NumbersPopover";
import {
  finishWhatsAppSignup,
  linkWhatsAppAccount,
  unlinkWhatsAppAccount,
  deleteWhatsAppAccount,
  markWhatsAppRead,
  saveWhatsAppBooking,
  sendWhatsAppReply,
  setWhatsAppStatus,
  updateWhatsAppChat,
  whatsAppChatTemplates,
  sendWhatsAppTemplate,
} from "@/lib/dashboard/actions/whatsapp";
import { verifyTokenFrom, whatsappCredential } from "@/lib/whatsapp";
import { siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp" };

/**
 * My inbox: every connected WhatsApp number, filterable by business. No page
 * header — business switcher, Numbers, Automation and Connect all sit in the
 * live chat's own toolbar so the chat gets the whole screen.
 */
export default async function WhatsAppPage({
  searchParams,
}: {
  searchParams: Promise<{ chat?: string; account?: string; tab?: string; q?: string; src?: string }>;
}) {
  const { chat, account, tab, q, src } = await searchParams;

  const [{ data: rows }, cred, { data: projectRows }] = await Promise.all([
    db.from("wa_accounts").select("id, label, display_phone, project_id, client_projects(name)").order("created_at"),
    whatsappCredential().catch(() => null),
    db.from("client_projects").select("id, name, clients(name)").order("name"),
  ]);
  const accountRows = (rows ?? []) as unknown as {
    id: string;
    label: string | null;
    display_phone: string | null;
    project_id: string | null;
    client_projects: { name: string } | null;
  }[];
  const all: InboxAccount[] = accountRows.map((a) => ({
    id: a.id,
    name: a.client_projects?.name ?? a.label ?? a.display_phone ?? "WhatsApp",
  }));
  const projects = (projectRows ?? []) as unknown as { id: string; name: string; clients: { name: string } | null }[];
  // Chats per number (for the delete warning).
  const chatCounts = new Map<string, number>();
  await Promise.all(
    accountRows.map(async (a) => {
      const { count } = await db.from("wa_contacts").select("id", { count: "exact", head: true }).eq("account_id", a.id);
      chatCounts.set(a.id, count ?? 0);
    })
  );
  const visible = account ? all.filter((a) => a.id === account) : all;

  const toolbar = (
    <>
      <NumbersPopover
        rows={accountRows.map((a) => ({
          id: a.id,
          display_phone: a.display_phone,
          label: a.label,
          project_id: a.project_id,
          chats: chatCounts.get(a.id) ?? 0,
        }))}
        projects={projects.map((p) => ({ id: p.id, label: `${p.clients?.name ? `${p.clients.name} — ` : ""}${p.name}` }))}
        onSave={linkWhatsAppAccount}
        onUnlink={unlinkWhatsAppAccount}
        onDelete={deleteWhatsAppAccount}
      />
      <Link
        href="/dashboard/whatsapp/automation"
        className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-2 text-small hover:bg-ink/5"
      >
        <Zap className="size-4" aria-hidden /> Automation
      </Link>
      <Link
        href="/dashboard/whatsapp/broadcasts"
        className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-2 text-small hover:bg-ink/5"
      >
        <Megaphone className="size-4" aria-hidden /> Broadcast
      </Link>
      <Link
        href="/dashboard/whatsapp/templates"
        className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-2 text-small hover:bg-ink/5"
      >
        <FileText className="size-4" aria-hidden /> Templates
      </Link>
      <Link
        href="/dashboard/whatsapp/pricing"
        className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-2 text-small hover:bg-ink/5"
      >
        <Calculator className="size-4" aria-hidden /> Pricing
      </Link>
      {cred && <ConnectWhatsApp appId={cred.app_id} configId={cred.config_id ?? null} onFinish={finishWhatsAppSignup} />}
    </>
  );

  return (
    <>
      {all.length === 0 && cred && (
        <Card className="p-6 mb-4 max-w-3xl">
          <h2 className="text-body-lg font-medium mb-2">Webhook</h2>
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

      <Inbox
        accounts={visible}
        basePath="/dashboard/whatsapp"
        query={account ? `account=${account}` : undefined}
        chatId={chat}
        tab={tab}
        search={q}
        source={src}
        scope={
          all.length > 1
            ? { param: "account", allLabel: "All businesses", options: all.map((a) => ({ value: a.id, label: a.name })) }
            : undefined
        }
        toolbar={toolbar}
        actions={{
          reply: sendWhatsAppReply,
          setStatus: setWhatsAppStatus,
          markRead: markWhatsAppRead,
          saveBooking: saveWhatsAppBooking,
          update: updateWhatsAppChat,
          templates: whatsAppChatTemplates,
          sendTemplate: sendWhatsAppTemplate,
        }}
      />
    </>
  );
}
