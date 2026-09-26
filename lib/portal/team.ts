"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/dashboard/db";
import { can, getPortalUser, type PortalContext } from "@/lib/portal/auth";
import { createPortalInvite, deletePortalLogin, listPortalMembers } from "@/lib/dashboard/portal-users";
import { rateLimit } from "@/lib/rate-limit";

// An Owner managing their own team from the portal. Everything is checked
// here against the signed-in Owner: they need the "team" feature, can only
// hand out features they themselves have (never "team"), only for their
// client's projects, and can only touch team members — never an Owner.

async function ownerContext(): Promise<PortalContext | { error: string }> {
  const ctx = await getPortalUser();
  if (!ctx) return { error: "Your session has ended — sign in again." };
  if (ctx.role !== "owner" || !can(ctx, "team")) return { error: "Only the portal Owner can manage the team." };
  return ctx;
}

async function validAccess(ctx: PortalContext, permissions: unknown, projectIds: unknown) {
  const parsed = z
    .object({ permissions: z.array(z.string()).max(10), projectIds: z.array(z.string().uuid()).max(100).nullable() })
    .safeParse({ permissions, projectIds });
  if (!parsed.success) return { ok: false, error: "Couldn't read that access." } as const;

  const allowed = ctx.features.filter((f) => f !== "team");
  const perms = parsed.data.permissions.filter((p): p is (typeof allowed)[number] => (allowed as string[]).includes(p));
  if (perms.length !== parsed.data.permissions.length) return { ok: false, error: "You can only give access you have yourself." } as const;

  let projects = parsed.data.projectIds;
  if (projects) {
    const { data } = await db.from("client_projects").select("id").eq("client_id", ctx.clientId).in("id", projects);
    if ((data ?? []).length !== projects.length) return { ok: false, error: "One of those projects isn't yours." } as const;
    if (projects.length === 0) projects = null;
  }
  return { ok: true, permissions: perms, projectIds: projects } as const;
}

async function teamMember(ctx: PortalContext, memberId: string) {
  if (!z.string().uuid().safeParse(memberId).success) return null;
  const { members } = await listPortalMembers(ctx.clientId);
  return members.find((m) => m.id === memberId && m.role === "member") ?? null;
}

export async function inviteTeamMember(email: string, permissions: string[], projectIds: string[] | null) {
  const ctx = await ownerContext();
  if ("error" in ctx) return ctx;
  const target = z.string().trim().toLowerCase().email().safeParse(email);
  if (!target.success) return { error: "Enter a valid email address." };
  const access = await validAccess(ctx, permissions, projectIds);
  if (!access.ok) return { error: access.error };
  if (!(await rateLimit(`portal-team-invite:${ctx.user.id}`, 20, 3600))) {
    return { error: "That's a lot of invites in an hour — try again later." };
  }

  const res = await createPortalInvite({
    clientId: ctx.clientId,
    email: target.data,
    role: "member",
    permissions: access.permissions,
    projectIds: access.projectIds,
    invitedBy: { userId: ctx.user.id, email: ctx.user.email ?? "The account owner" },
  });
  revalidatePath("/portal/team");
  return res;
}

export async function updateTeamMember(memberId: string, permissions: string[], projectIds: string[] | null) {
  const ctx = await ownerContext();
  if ("error" in ctx) return ctx;
  const member = await teamMember(ctx, memberId);
  if (!member) return { error: "Not found." };
  const access = await validAccess(ctx, permissions, projectIds);
  if (!access.ok) return { error: access.error };

  const { error } = await db
    .from("client_portal_users")
    .update({ permissions: access.permissions, project_ids: access.projectIds })
    .eq("id", member.id)
    .eq("client_id", ctx.clientId)
    .eq("role", "member");
  if (error) return { error: "Couldn't save — please try again." };
  revalidatePath("/portal/team");
  return { ok: true };
}

export async function removeTeamMember(memberId: string) {
  const ctx = await ownerContext();
  if ("error" in ctx) return ctx;
  const member = await teamMember(ctx, memberId);
  if (!member) return { error: "Not found." };
  const res = await deletePortalLogin(member, ctx.clientId);
  revalidatePath("/portal/team");
  return res;
}

export async function resendTeamInvite(memberId: string) {
  const ctx = await ownerContext();
  if ("error" in ctx) return ctx;
  const member = await teamMember(ctx, memberId);
  if (!member) return { error: "Not found." };
  if (!(await rateLimit(`portal-team-invite:${ctx.user.id}`, 20, 3600))) {
    return { error: "That's a lot of invites in an hour — try again later." };
  }
  return createPortalInvite({
    clientId: ctx.clientId,
    email: member.email,
    role: "member",
    permissions: member.permissions,
    projectIds: member.projectIds,
    invitedBy: { userId: ctx.user.id, email: ctx.user.email ?? "The account owner" },
  });
}
