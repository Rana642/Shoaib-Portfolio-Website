import { db } from "@/lib/dashboard/db";
import { Card, PageHeader } from "@/components/dashboard/ui";
import ConnectWhatsApp from "@/components/whatsapp/ConnectWhatsApp";
import NumbersList from "@/components/whatsapp/NumbersList";
import {
  deleteWhatsAppAccount,
  finishWhatsAppSignup,
  linkWhatsAppAccount,
  restoreWhatsAppCallback,
  unlinkWhatsAppAccount,
} from "@/lib/dashboard/actions/whatsapp";
import { verifyTokenFrom, whatsappCredential } from "@/lib/whatsapp";
import { siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp numbers" };

/** Connect WhatsApp numbers and link each one to a business (whose portal then shows its chats). */
export default async function WhatsAppNumbersPage({ searchParams }: { searchParams: Promise<{ callback?: string }> }) {
  const { callback } = await searchParams;
  const [{ data: rows }, cred, { data: projectRows }] = await Promise.all([
    db.from("wa_accounts").select("id, label, display_phone, project_id").order("created_at"),
    whatsappCredential().catch(() => null),
    db.from("client_projects").select("id, name, clients(name)").order("name"),
  ]);
  const accounts = (rows ?? []) as { id: string; label: string | null; display_phone: string | null; project_id: string | null }[];
  const projects = (projectRows ?? []) as unknown as { id: string; name: string; clients: { name: string } | null }[];

  // Chats per number (for the delete warning).
  const chatCounts = new Map<string, number>();
  await Promise.all(
    accounts.map(async (a) => {
      const { count } = await db.from("wa_contacts").select("id", { count: "exact", head: true }).eq("account_id", a.id);
      chatCounts.set(a.id, count ?? 0);
    })
  );

  return (
    <>
      <PageHeader
        title="Numbers"
        description="Connect WhatsApp numbers and link each one to a business. A linked number's chats show in that client's portal (with the WhatsApp feature on)."
        action={cred ? <ConnectWhatsApp appId={cred.app_id} configId={cred.config_id ?? null} onFinish={finishWhatsAppSignup} /> : undefined}
      />

      <Card className="p-6 mb-6">
        <NumbersList
          rows={accounts.map((a) => ({ ...a, chats: chatCounts.get(a.id) ?? 0 }))}
          projects={projects.map((p) => ({ id: p.id, label: `${p.clients?.name ? `${p.clients.name} — ` : ""}${p.name}` }))}
          onSave={linkWhatsAppAccount}
          onUnlink={unlinkWhatsAppAccount}
          onDelete={deleteWhatsAppAccount}
        />
      </Card>

      <Card className="p-6 max-w-3xl mb-6">
        <h2 className="text-body-lg font-medium mb-2">Webhooks back to this site</h2>
        <p className="text-small text-ink-muted mb-3">
          Only for the way back from Socially Snap: points a number&apos;s webhooks at this site again. Then set WHATSAPP_VIA_SOCIALLY_SNAP to off in Vercel.
        </p>
        {callback === "restored" && <p className="text-small mb-3">Done: Meta now sends this number&apos;s messages here.</p>}
        {callback === "failed" && <p className="text-small mb-3">Meta did not accept it. Nothing changed; try again or check the Vercel logs.</p>}
        <div className="grid gap-2">
          {accounts.map((a) => (
            <form key={a.id} action={restoreWhatsAppCallback} className="flex items-center gap-3 text-small">
              <input type="hidden" name="account_id" value={a.id} />
              <span>{a.label ?? a.display_phone ?? a.id}</span>
              <button type="submit" className="underline">Take webhooks back</button>
            </form>
          ))}
        </div>
      </Card>

      {cred && (
        <Card className="p-6 max-w-3xl">
          <h2 className="text-body-lg font-medium mb-2">Webhook (Meta app settings)</h2>
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
    </>
  );
}
