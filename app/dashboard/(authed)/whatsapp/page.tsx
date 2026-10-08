import Link from "next/link";
import { db } from "@/lib/dashboard/db";
import { PageHeader, Card, buttonStyles, inputClasses } from "@/components/dashboard/ui";
import Inbox, { type InboxAccount } from "@/components/whatsapp/Inbox";
import ConnectWhatsApp from "@/components/whatsapp/ConnectWhatsApp";
import {
  finishWhatsAppSignup,
  linkWhatsAppAccount,
  markWhatsAppRead,
  saveWhatsAppBooking,
  sendWhatsAppReply,
  setWhatsAppStatus,
} from "@/lib/dashboard/actions/whatsapp";
import { verifyTokenFrom, whatsappCredential } from "@/lib/whatsapp";
import { siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp" };

/** My inbox: every connected WhatsApp number, filterable by business. */
export default async function WhatsAppPage({
  searchParams,
}: {
  searchParams: Promise<{ chat?: string; account?: string; numbers?: string }>;
}) {
  const { chat, account, numbers } = await searchParams;

  const [{ data: rows }, cred] = await Promise.all([
    db.from("wa_accounts").select("id, label, display_phone, project_id, client_projects(name)").order("created_at"),
    whatsappCredential().catch(() => null),
  ]);
  const accountRows = (rows ?? []) as unknown as {
    id: string;
    label: string | null;
    display_phone: string | null;
    project_id: string | null;
    client_projects: { name: string } | null;
  }[];
  const all: InboxAccount[] = accountRows.map((a) => ({ id: a.id, name: a.client_projects?.name ?? a.label ?? a.display_phone ?? "WhatsApp" }));
  const { data: projectRows } = numbers
    ? await db.from("client_projects").select("id, name, clients(name)").order("name")
    : { data: null };
  const projects = (projectRows ?? []) as unknown as { id: string; name: string; clients: { name: string } | null }[];
  const visible = account ? all.filter((a) => a.id === account) : all;

  return (
    <>
      <PageHeader
        title="WhatsApp"
        description="Chats from every connected WhatsApp number. The website's Ref code shows which ad each guest came from. Clients see their own numbers in their portal."
      />

      {all.length === 0 && cred && (
        <Card className="p-6 mb-6 max-w-3xl">
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

      <div className="mb-4 flex flex-wrap gap-4 text-small">
        <Link href={numbers ? "/dashboard/whatsapp" : "/dashboard/whatsapp?numbers=1"} className="underline underline-offset-4">
          {numbers ? "Hide numbers" : "Numbers & businesses"}
        </Link>
        <Link href="/dashboard/whatsapp/automation" className="underline underline-offset-4">
          Automation &amp; quick replies
        </Link>
      </div>

      {numbers && (
        <Card className="p-6 mb-6">
          <h2 className="text-body-lg font-medium mb-1">Numbers &amp; businesses</h2>
          <p className="text-small text-ink-muted mb-4">
            Link each WhatsApp number to a business. Its chats then appear in that client&apos;s portal (with the WhatsApp feature on).
          </p>
          {cred && (
            <div className="mb-5">
              <ConnectWhatsApp appId={cred.app_id} configId={cred.config_id ?? null} onFinish={finishWhatsAppSignup} />
            </div>
          )}
          <div className="space-y-3">
            {accountRows.map((a) => {
              async function save(formData: FormData) {
                "use server";
                await linkWhatsAppAccount(a.id, formData);
              }
              return (
                <form key={a.id} action={save} className="grid gap-3 sm:grid-cols-[180px_1fr_1fr_auto] items-end">
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
          </div>
        </Card>
      )}

      {all.length > 1 && (
        <nav className="flex flex-wrap gap-2 mb-4 text-small">
          <Link
            href="/dashboard/whatsapp"
            className={`rounded-lg border px-3 py-1.5 ${!account ? "border-ink bg-ink text-cloud" : "border-ink/15 hover:bg-ink/5"}`}
          >
            All businesses
          </Link>
          {all.map((a) => (
            <Link
              key={a.id}
              href={`/dashboard/whatsapp?account=${a.id}`}
              className={`rounded-lg border px-3 py-1.5 ${account === a.id ? "border-ink bg-ink text-cloud" : "border-ink/15 hover:bg-ink/5"}`}
            >
              {a.name}
            </Link>
          ))}
        </nav>
      )}

      <Inbox
        accounts={visible}
        basePath="/dashboard/whatsapp"
        query={account ? `account=${account}` : undefined}
        chatId={chat}
        actions={{ reply: sendWhatsAppReply, setStatus: setWhatsAppStatus, markRead: markWhatsAppRead, saveBooking: saveWhatsAppBooking }}
      />
    </>
  );
}
