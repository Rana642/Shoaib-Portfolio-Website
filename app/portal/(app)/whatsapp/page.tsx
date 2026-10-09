import { redirect } from "next/navigation";
import { db } from "@/lib/dashboard/db";
import { can, canSeeProject, requirePortalUser } from "@/lib/portal/auth";
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
 * The client's WhatsApp inbox: only the numbers linked to their own
 * projects (and, for a project-limited team member, only those projects).
 * One business at a time, switched with the tabs on top.
 */
export default async function PortalWhatsAppPage({
  searchParams,
}: {
  searchParams: Promise<{
    project?: string;
    chat?: string;
    tab?: string;
    q?: string;
    src?: string;
  }>;
}) {
  const ctx = await requirePortalUser();
  if (!can(ctx, "whatsapp")) redirect("/portal");
  const { project, chat, tab, q, src } = await searchParams;

  const { data: projectRows } = await db
    .from("client_projects")
    .select("id, name")
    .eq("client_id", ctx.clientId)
    .order("sort_order");
  const projects = (projectRows ?? []).filter((p) =>
    canSeeProject(ctx, p.id as string),
  );
  const { data: accountRows } = projects.length
    ? await db
        .from("wa_accounts")
        .select("id, project_id")
        .in(
          "project_id",
          projects.map((p) => p.id as string),
        )
    : { data: [] };

  // Only businesses that actually have a WhatsApp number connected.
  const withWhatsApp = projects.filter((p) =>
    (accountRows ?? []).some((a) => a.project_id === p.id),
  );
  if (withWhatsApp.length === 0) {
    return (
      <>
        <PageHeader title="WhatsApp" />
        <Card variant="solid" className="p-6">
          <p className="text-small text-ink-muted">
            No WhatsApp number is connected yet — I&apos;ll set it up for you.
          </p>
        </Card>
      </>
    );
  }
  const selected =
    withWhatsApp.find((p) => p.id === project) ?? withWhatsApp[0];
  const accounts = (accountRows ?? [])
    .filter((a) => a.project_id === selected.id)
    .map((a) => ({ id: a.id as string, name: selected.name as string }));

  return (
    <>
      <Inbox
        accounts={accounts}
        basePath="/portal/whatsapp"
        query={`project=${selected.id}`}
        chatId={chat}
        tab={tab}
        search={q}
        source={src}
        scope={
          withWhatsApp.length > 1
            ? {
                param: "project",
                options: withWhatsApp.map((p) => ({
                  value: p.id as string,
                  label: p.name as string,
                })),
              }
            : undefined
        }
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
    </>
  );
}
