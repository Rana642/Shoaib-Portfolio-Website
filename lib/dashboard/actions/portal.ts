"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db";
import { getAdminUser } from "../auth";
import {
  PORTAL_SETUP_MESSAGE,
  ROLES_SETUP_MESSAGE,
  createPortalInvite,
  deletePortalLogin,
  listPortalMembers,
} from "../portal-users";
import { DELEGABLE, FEATURE_KEYS, type PortalFeature } from "../../portal/features";

// Shoaib's side of the client portal: which features a client gets, and
// who has access (any role). Owners manage their own team from the portal
// (lib/portal/team.ts), within what's set here.

async function assertAuthed() {
  const user = await getAdminUser();
  if (!user) redirect("/dashboard/login");
}

const uuid = z.string().uuid();
const memberSchema = z.object({
  role: z.enum(["owner", "member"]),
  permissions: z.array(z.enum(DELEGABLE as [PortalFeature, ...PortalFeature[]])).max(10),
  projectIds: z.array(uuid).max(100).nullable(),
});

/** The client's portal features — what its Owner(s) get. */
export async function setPortalFeatures(clientId: string, features: string[]) {
  await assertAuthed();
  const parsed = z
    .object({ clientId: uuid, features: z.array(z.enum(FEATURE_KEYS as [PortalFeature, ...PortalFeature[]])).max(10) })
    .safeParse({ clientId, features });
  if (!parsed.success) return { error: "Couldn't read those features." };
  const { error } = await db.from("clients").update({ portal_features: parsed.data.features }).eq("id", parsed.data.clientId);
  if (error) return { error: error.code === "PGRST204" ? ROLES_SETUP_MESSAGE : error.message };
  revalidatePath(`/dashboard/clients/${clientId}`);
  return { ok: true };
}

/** Invites (or re-invites) someone at a client, as Owner or team member. */
export async function inviteToPortal(
  clientId: string,
  email: string,
  access: { role: "owner" | "member"; permissions: string[]; projectIds: string[] | null } = {
    role: "owner",
    permissions: [],
    projectIds: null,
  }
) {
  await assertAuthed();
  const target = z.string().trim().toLowerCase().email().safeParse(email);
  const parsed = memberSchema.safeParse(access);
  if (!uuid.safeParse(clientId).success || !target.success) return { error: "Enter a valid email address." };
  if (!parsed.success) return { error: "Couldn't read that access." };

  const { error: probe } = await db.from("client_portal_users").select("id").limit(1);
  if (probe) return { error: probe.code === "PGRST205" ? PORTAL_SETUP_MESSAGE : probe.message };

  const res = await createPortalInvite({ clientId, email: target.data, ...parsed.data, invitedBy: null });
  revalidatePath(`/dashboard/clients/${clientId}`);
  return res;
}

/** Changes someone's role, ticks or projects — takes effect immediately. */
export async function updatePortalMember(
  memberId: string,
  access: { role: "owner" | "member"; permissions: string[]; projectIds: string[] | null }
) {
  await assertAuthed();
  const parsed = memberSchema.safeParse(access);
  if (!uuid.safeParse(memberId).success || !parsed.success) return { error: "Couldn't read that access." };
  const { role, permissions, projectIds } = parsed.data;
  const { data, error } = await db
    .from("client_portal_users")
    .update({
      role,
      permissions: role === "owner" ? [] : permissions,
      project_ids: role === "owner" ? null : projectIds,
    })
    .eq("id", memberId)
    .select("client_id")
    .maybeSingle();
  if (error) return { error: error.code === "PGRST204" ? ROLES_SETUP_MESSAGE : error.message };
  if (data) revalidatePath(`/dashboard/clients/${data.client_id}`);
  return { ok: true };
}

/** Removes a person's portal access for good (deletes their login). */
export async function removePortalUser(memberId: string) {
  await assertAuthed();
  if (!uuid.safeParse(memberId).success) return { error: "Not found." };
  const { data: row } = await db.from("client_portal_users").select("client_id").eq("id", memberId).maybeSingle();
  if (!row) return { error: "Not found." };
  const { members } = await listPortalMembers(row.client_id);
  const member = members.find((m) => m.id === memberId);
  if (!member) return { error: "Not found." };
  const res = await deletePortalLogin(member, row.client_id);
  revalidatePath(`/dashboard/clients/${row.client_id}`);
  return res;
}
