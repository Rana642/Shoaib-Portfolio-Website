import { db } from "@/lib/dashboard/db";
import { Card, PageHeader } from "@/components/dashboard/ui";
import ConnectWhatsApp from "@/components/whatsapp/ConnectWhatsApp";
import NumbersList from "@/components/whatsapp/NumbersList";
import {
  deleteWhatsAppAccount,
  finishWhatsAppSignup,
  linkWhatsAppAccount,
  unlinkWhatsAppAccount,
} from "@/lib/dashboard/actions/whatsapp";
import { verifyTokenFrom, whatsappCredential } from "@/lib/whatsapp";
import { siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp numbers" };

/** Connect WhatsApp numbers and link each one to a business (whose portal then shows its chats). */
export default async function WhatsAppNumbersPage() {
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
