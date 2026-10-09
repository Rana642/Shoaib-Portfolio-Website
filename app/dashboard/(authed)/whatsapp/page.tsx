import { db } from "@/lib/dashboard/db";
import Inbox, { type InboxAccount } from "@/components/whatsapp/Inbox";
import {
  markWhatsAppRead,
  saveWhatsAppBooking,
  sendWhatsAppReply,
  setWhatsAppStatus,
  updateWhatsAppChat,
  whatsAppChatTemplates,
  sendWhatsAppTemplate,
} from "@/lib/dashboard/actions/whatsapp";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp" };

/**
 * My inbox: every connected WhatsApp number, filterable by business. The
 * other WhatsApp tools (broadcasts, templates, automation, numbers, pricing)
 * live in the section menu on the left (app/dashboard/(authed)/whatsapp/layout.tsx).
 */
export default async function WhatsAppPage({
  searchParams,
}: {
  searchParams: Promise<{ chat?: string; account?: string; tab?: string; q?: string; src?: string }>;
}) {
  const { chat, account, tab, q, src } = await searchParams;

  const { data: rows } = await db.from("wa_accounts").select("id, label, display_phone, client_projects(name)").order("created_at");
  const all: InboxAccount[] = (
    (rows ?? []) as unknown as {
      id: string;
      label: string | null;
      display_phone: string | null;
      client_projects: { name: string } | null;
    }[]
  ).map((a) => ({ id: a.id, name: a.client_projects?.name ?? a.label ?? a.display_phone ?? "WhatsApp" }));
  const visible = account ? all.filter((a) => a.id === account) : all;

  return (
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
  );
}
