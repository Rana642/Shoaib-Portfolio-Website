import { db } from "@/lib/dashboard/db";
import { Card, PageHeader } from "@/components/dashboard/ui";
import ConnectWhatsApp from "@/components/whatsapp/ConnectWhatsApp";
import NumbersList from "@/components/whatsapp/NumbersList";
import {
  deleteWhatsAppAccount,
  finishWhatsAppSignup,
  linkSociallySnapNumberAction,
  linkWhatsAppAccount,
  restoreWhatsAppCallback,
  unlinkWhatsAppAccount,
} from "@/lib/dashboard/actions/whatsapp";
import { verifyTokenFrom, whatsappCredential } from "@/lib/whatsapp";
import { siteUrl } from "@/lib/seo";
import { platformNumbers, type PlatformNumber } from "@/lib/socially-snap/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp numbers" };

/** Connect WhatsApp numbers and link each one to a business (whose portal then shows its chats). */
export default async function WhatsAppNumbersPage({ searchParams }: { searchParams: Promise<{ callback?: string; linked?: string }> }) {
  const { callback, linked } = await searchParams;
  const [{ data: rows }, cred, { data: projectRows }] = await Promise.all([
    db.from("wa_accounts").select("id, label, display_phone, project_id, phone_number_id, via_socially_snap").order("created_at"),
    whatsappCredential().catch(() => null),
    db.from("client_projects").select("id, name, clients(name)").order("name"),
  ]);
  const accounts = (rows ?? []) as { id: string; label: string | null; display_phone: string | null; project_id: string | null; phone_number_id: string; via_socially_snap: boolean }[];
  const projects = (projectRows ?? []) as unknown as { id: string; name: string; clients: { name: string } | null }[];

  // Numbers connected in Socially Snap that aren't here yet. A failure (switch off, key missing) shows as text, not a crash.
  let offer: PlatformNumber[] = [];
  let offerProblem: string | null = null;
  try {
    const have = new Set(accounts.map((a) => a.phone_number_id));
    offer = (await platformNumbers()).filter((n) => !have.has(n.phoneNumberId));
  } catch (e) {
    offerProblem = e instanceof Error ? e.message : "Couldn't reach Socially Snap.";
  }

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
        <h2 className="text-body-lg font-medium mb-2">Link a Socially Snap number</h2>
        <p className="text-small text-ink-muted mb-3">
          For a hotel number the owner connected in the Socially Snap dashboard. This site keeps no Meta token for it: messages, templates and broadcasts go through Socially Snap.
        </p>
        {linked === "ok" && <p className="text-small mb-3">Linked. Its chats now show in the WhatsApp inbox and in that client&apos;s portal.</p>}
        {linked === "failed" && (
          <p className="text-small mb-3">
            Not linked. Check that the number is connected in Socially Snap, that it isn&apos;t already linked to another hotel, and that WHATSAPP_VIA_SOCIALLY_SNAP is live. Details are in the Vercel logs.
          </p>
        )}
        {offerProblem && <p className="text-small mb-3">Can&apos;t read the Socially Snap numbers: {offerProblem}</p>}
        {!offerProblem && !offer.length && <p className="text-small text-ink-muted">No unlinked numbers in the Socially Snap workspace.</p>}
        {offer.length > 0 && (
          <form action={linkSociallySnapNumberAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
            <label className="text-small">
              <span className="block text-ink-muted mb-1">Number</span>
              <select name="phone_number_id" required className="w-full rounded-md border border-line bg-white px-3 py-2">
                {offer.map((n) => (
                  <option key={n.phoneNumberId} value={n.phoneNumberId}>
                    {n.displayPhone || n.phoneNumberId}
                    {n.name ? ` — ${n.name}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-small">
              <span className="block text-ink-muted mb-1">Hotel</span>
              <select name="project_id" required className="w-full rounded-md border border-line bg-white px-3 py-2">
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.clients?.name ? `${p.clients.name} — ` : ""}
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-md bg-ink px-4 py-2 text-small text-white">
              Link
            </button>
          </form>
        )}
      </Card>

      <Card className="p-6 max-w-3xl mb-6">
        <h2 className="text-body-lg font-medium mb-2">Webhooks back to this site</h2>
        <p className="text-small text-ink-muted mb-3">
          Only for the way back from Socially Snap: points a number&apos;s webhooks at this site again. Then set WHATSAPP_VIA_SOCIALLY_SNAP to off in Vercel.
        </p>
        {callback === "restored" && <p className="text-small mb-3">Done: Meta now sends this number&apos;s messages here.</p>}
        {callback === "failed" && <p className="text-small mb-3">Meta did not accept it. Nothing changed; try again or check the Vercel logs.</p>}
        <div className="grid gap-2">
          {accounts.filter((a) => !a.via_socially_snap).map((a) => (
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
