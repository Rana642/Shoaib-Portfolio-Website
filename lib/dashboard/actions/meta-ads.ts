"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminUser } from "../auth";
import { db } from "../db";
import {
  CAMPAIGN_OBJECTIVES,
  createPausedCampaign,
  getConnection,
  getConnectionToken,
  setCampaignStatus,
} from "../../meta-ads-connections";

async function assertAuthed() {
  const user = await getAdminUser();
  if (!user) redirect("/dashboard/login");
}

const back = (projectId: string, extra = "") => `/dashboard/ads?project=${projectId}${extra}`;

export async function selectMetaAdAccount(formData: FormData) {
  await assertAuthed();
  const projectId = String(formData.get("project_id") ?? "");
  const accountId = String(formData.get("ad_account_id") ?? "");
  const conn = await getConnection(projectId);
  if (!conn || !conn.ad_accounts.some((a) => a.id === accountId)) redirect(back(projectId, "&error=account"));
  await db.from("meta_ad_connections").update({ selected_ad_account_id: accountId }).eq("project_id", projectId);
  revalidatePath("/dashboard/ads");
  redirect(back(projectId));
}

export async function createMetaCampaign(formData: FormData) {
  await assertAuthed();
  const projectId = String(formData.get("project_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const objective = String(formData.get("objective") ?? "");
  if (!name || name.length > 200) redirect(back(projectId, "&error=name"));
  if (!CAMPAIGN_OBJECTIVES.some((o) => o.value === objective)) redirect(back(projectId, "&error=objective"));
  const conn = await getConnection(projectId);
  if (!conn?.selected_ad_account_id) redirect(back(projectId, "&error=account"));
  let message = "&created=1";
  try {
    await createPausedCampaign(await getConnectionToken(projectId), conn.selected_ad_account_id, name, objective);
  } catch (error) {
    message = `&error=${encodeURIComponent(error instanceof Error ? error.message : "create")}`;
  }
  revalidatePath("/dashboard/ads");
  redirect(back(projectId, message));
}

export async function toggleMetaCampaign(formData: FormData) {
  await assertAuthed();
  const projectId = String(formData.get("project_id") ?? "");
  const campaignId = String(formData.get("campaign_id") ?? "");
  const status = formData.get("status") === "ACTIVE" ? "ACTIVE" : "PAUSED";
  let message = "";
  try {
    await setCampaignStatus(await getConnectionToken(projectId), campaignId, status);
  } catch (error) {
    message = `&error=${encodeURIComponent(error instanceof Error ? error.message : "status")}`;
  }
  revalidatePath("/dashboard/ads");
  redirect(back(projectId, message));
}

export async function disconnectMetaAds(formData: FormData) {
  await assertAuthed();
  const projectId = String(formData.get("project_id") ?? "");
  await db.from("meta_ad_connections").delete().eq("project_id", projectId);
  revalidatePath("/dashboard/ads");
  redirect(back(projectId, "&disconnected=1"));
}
