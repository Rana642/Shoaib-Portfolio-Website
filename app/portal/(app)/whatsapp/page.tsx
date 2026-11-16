import { redirect } from "next/navigation";
import { db } from "@/lib/dashboard/db";
import { can, requirePortalUser } from "@/lib/portal/auth";
import { activeProject } from "@/lib/portal/active-project";
import { Card, PageHeader } from "@/components/dashboard/ui";
import Inbox from "@/components/whatsapp/Inbox";
import {
  portalWhatsAppBooking,
  portalWhatsAppRead,
  portalWhatsAppReply,
  portalWhatsAppStatus,
  portalWhatsAppUpdate,
  portalChatTemplates,
  portalSendTemplate,
} from "@/lib/portal/whatsapp";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp" };

/**
 * The WhatsApp inbox of the business chosen in the sidebar: only the numbers linked to that business
 * (and, for a project-limited team member, only if it is one of theirs).
 */
export default async function PortalWhatsAppPage({
  searchParams,
}: {
  searchParams: Promise<{ chat?: string; tab?: string; q?: string; src?: string }>;
}) {
  const ctx = await requirePortalUser();
  if (!can(ctx, "whatsapp")) redirect("/portal");
  const { chat, tab, q, src } = await searchParams;
  const { active } = await activeProject(ctx);

  const { data: accountRows } = active ? await db.from("wa_accounts").select("id").eq("project_id", active.id) : { data: [] };
  if (!active || !(accountRows ?? []).length) {
    return (
      <>
        <PageHeader title="WhatsApp" />
        <Card variant="solid" className="p-6">
          <p className="text-small text-ink-muted">
            No WhatsApp number is connected yet{active ? ` for ${active.name}` : ""} — I&apos;ll set it up for you.
          </p>
        </Card>
      </>
    );
  }
  const accounts = (accountRows ?? []).map((a) => ({ id: a.id as string, name: active.name }));

  return (
    <Inbox
      accounts={accounts}
      basePath="/portal/whatsapp"
      query=""
      chatId={chat}
      tab={tab}
      search={q}
      source={src}
      actions={{
        reply: portalWhatsAppReply,
        setStatus: portalWhatsAppStatus,
        markRead: portalWhatsAppRead,
        saveBooking: portalWhatsAppBooking,
        update: portalWhatsAppUpdate,
        templates: portalChatTemplates,
        sendTemplate: portalSendTemplate,
      }}
    />
  );
}
