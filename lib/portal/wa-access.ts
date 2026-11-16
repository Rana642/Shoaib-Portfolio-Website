import "server-only";
import { db } from "@/lib/dashboard/db";
import { can, canSeeProject, requirePortalUser, type PortalContext } from "./auth";
import type { PortalFeature } from "./features";

/**
 * The portal user, if they hold `feature` AND this WhatsApp number belongs to one of their client's
 * projects that they may see. Every portal action on a number goes through this: the id comes from
 * the browser, so it is never trusted until the database says it is theirs.
 */
export async function portalAccountAccess(accountId: string, feature: PortalFeature): Promise<PortalContext | null> {
  const ctx = await requirePortalUser();
  if (!can(ctx, feature)) return null;
  if (typeof accountId !== "string" || !/^[0-9a-f-]{36}$/i.test(accountId)) return null;
  const { data } = await db.from("wa_accounts").select("project_id, client_projects!inner(client_id)").eq("id", accountId).maybeSingle();
  const row = data as unknown as { project_id: string | null; client_projects: { client_id: string } } | null;
  if (!row?.project_id || row.client_projects.client_id !== ctx.clientId || !canSeeProject(ctx, row.project_id)) return null;
  return ctx;
}

/** The same check for a quick reply, through the number it belongs to. */
export async function portalQuickReplyAccess(quickReplyId: string, feature: PortalFeature): Promise<PortalContext | null> {
  if (typeof quickReplyId !== "string" || !/^[0-9a-f-]{36}$/i.test(quickReplyId)) return null;
  const { data } = await db.from("wa_quick_replies").select("account_id").eq("id", quickReplyId).maybeSingle();
  return data?.account_id ? portalAccountAccess(data.account_id as string, feature) : null;
}
