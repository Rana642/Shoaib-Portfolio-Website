import Link from "next/link";
import { Settings2, Zap } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { Card, buttonStyles, inputClasses } from "@/components/dashboard/ui";
import Inbox, { type InboxAccount } from "@/components/whatsapp/Inbox";
import ConnectWhatsApp from "@/components/whatsapp/ConnectWhatsApp";
import {
  finishWhatsAppSignup,
  linkWhatsAppAccount,
  markWhatsAppRead,
  saveWhatsAppBooking,
  sendWhatsAppReply,
  setWhatsAppStatus,
  updateWhatsAppChat,
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
  const visible = account ? all.filter((a) => a.id === account) : all;

  const toolbar = (
    <>
      <details className="relative">
        <summary className="list-none cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-2 text-small hover:bg-ink/5">
          <Settings2 className="size-4" aria-hidden /> Numbers
        </summary>
        <Card variant="solid" className="absolute right-0 top-full mt-2 z-30 w-[min(760px,90vw)] p-5 shadow-xl">
          <p className="text-small text-ink-muted mb-4">
            Link each WhatsApp number to a business. Its chats then appear in that client&apos;s portal (with the WhatsApp feature on).
          </p>
          <div className="space-y-3">
            {accountRows.map((a) => {
              async function save(formData: FormData) {
                "use server";
                await linkWhatsAppAccount(a.id, formData);
              }
              return (
                <form key={a.id} action={save} className="grid gap-3 sm:grid-cols-[140px_1fr_1fr_auto] items-end">
                  <p className="text-small font-mono">{a.display_phone ?? a.id.slice(0, 8)}</p>
                  <label className="text-small">
                    <span className="block text-ink-muted mb-1">Label</span>
                    <input name="label" defaultValue={a.label ?? ""} className={inputClasses} />
                  </label>
                  <label className="text-small">
                    <span className="block text-ink-muted mb-1">Business</span>
                    <select name="project_id" defaultValue={a.project_id ?? ""} className={inputClasses}>
                      <option value="">Not linked (only in my dashboard)</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.clients?.name ? `${p.clients.name} — ` : ""}
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className={buttonStyles.secondary}>
                    Save
                  </button>
                </form>
              );
            })}
            {accountRows.length === 0 && <p className="text-small text-ink-muted">No numbers connected yet.</p>}
          </div>
        </Card>
      </details>
      <Link
        href="/dashboard/whatsapp/automation"
        className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-2 text-small hover:bg-ink/5"
      >
        <Zap className="size-4" aria-hidden /> Automation
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
        }}
      />
    </>
  );
}
