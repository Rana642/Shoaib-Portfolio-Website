"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/dashboard/db";
import { can, canSeeProject, requirePortalUser, type PortalContext } from "./auth";
import { contactKey } from "./contacts-merge";

// Client-portal actions on the contact book. The business or contact id comes from the browser, so each one
// proves it belongs to the caller's own client (and, for a project-limited member, to one of their projects).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO = { error: "You don't have access to this." };

async function projectAccess(projectId: string): Promise<PortalContext | null> {
  const ctx = await requirePortalUser();
  if (!can(ctx, "contacts") || typeof projectId !== "string" || !UUID.test(projectId)) return null;
  const { data } = await db.from("client_projects").select("client_id").eq("id", projectId).maybeSingle();
  if (!data || data.client_id !== ctx.clientId || !canSeeProject(ctx, projectId)) return null;
  return ctx;
}

async function contactAccess(contactId: string): Promise<{ projectId: string; sources: string[] } | null> {
  if (typeof contactId !== "string" || !UUID.test(contactId)) return null;
  const { data } = await db.from("portal_contacts").select("project_id, sources").eq("id", contactId).maybeSingle();
  if (!data) return null;
  return (await projectAccess(data.project_id as string)) ? { projectId: data.project_id as string, sources: (data.sources as string[]) ?? [] } : null;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Someone the guest or the staff met in person, or a number from a notebook: saved like any other contact. */
export async function portalAddContact(projectId: string, input: { name: string; phone: string; email: string; notes: string }) {
  if (!(await projectAccess(projectId))) return NO;
  const name = text(input?.name, 120);
  const phone = text(input?.phone, 40);
  const email = text(input?.email, 160);
  const notes = text(input?.notes, 2000);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That e-mail doesn't look right." };
  const key = contactKey(phone, email, name);
  if (!key) return { error: "Add a name, a phone number or an e-mail." };

  const { data: have } = await db.from("portal_contacts").select("id, sources").eq("project_id", projectId).eq("contact_key", key).maybeSingle();
  if (have) {
    const sources = [...new Set([...((have.sources as string[]) ?? []), "manual"])];
    const { error } = await db
      .from("portal_contacts")
      .update({ sources, ...(notes ? { notes } : {}), updated_at: new Date().toISOString() })
      .eq("id", have.id);
    if (error) return { error: "Couldn't save the contact." };
  } else {
    const { error } = await db.from("portal_contacts").insert({
      project_id: projectId,
      contact_key: key,
      name: name || null,
      phone: phone || null,
      email: email || null,
      notes: notes || null,
      sources: ["manual"],
      last_activity_at: new Date().toISOString(),
    });
    if (error) return { error: "Couldn't save the contact." };
  }
  revalidatePath("/portal/contacts");
  return { ok: true as const };
}

export async function portalSaveContactNote(contactId: string, note: string) {
  if (!(await contactAccess(contactId))) return NO;
  const { error } = await db
    .from("portal_contacts")
    .update({ notes: text(note, 2000) || null, updated_at: new Date().toISOString() })
    .eq("id", contactId);
  if (error) return { error: "Couldn't save the note." };
  revalidatePath("/portal/contacts");
  return { ok: true as const };
}

/** Only people added by hand can be removed: a contact that comes from the website or WhatsApp would simply come back. */
export async function portalDeleteContact(contactId: string) {
  const access = await contactAccess(contactId);
  if (!access) return NO;
  if (access.sources.length !== 1 || access.sources[0] !== "manual") return { error: "Only contacts added by hand can be removed." };
  await db.from("portal_contacts").delete().eq("id", contactId);
  revalidatePath("/portal/contacts");
  return { ok: true as const };
}

/**
 * Staff record that a guest agreed to offers on WhatsApp (in person, by phone or in writing), or take it back.
 * Works on the guest's WhatsApp chats of this business; a guest who sent STOP can't be marked.
 */
export async function portalSetMarketingOptIn(contactId: string, on: boolean) {
  if (typeof on !== "boolean") return NO;
  const access = await contactAccess(contactId);
  if (!access) return NO;
  // Recording consent is a marketing decision: the Owner, or a member who may send marketing broadcasts.
  const ctx = await requirePortalUser();
  if (ctx.role !== "owner" && !can(ctx, "wa_broadcasts")) return { error: "Only the Owner, or someone allowed to send marketing broadcasts, can record this." };
  const { data: contact } = await db.from("portal_contacts").select("contact_key").eq("id", contactId).maybeSingle();
  const key = (contact?.contact_key as string | undefined) ?? "";
  if (!/^[0-9]{7,}$/.test(key)) return { error: "This person has no WhatsApp number to send offers to." };

  const { data: accounts } = await db.from("wa_accounts").select("id").eq("project_id", access.projectId);
  const ids = (accounts ?? []).map((a) => a.id as string);
  if (!ids.length) return { error: "No WhatsApp number is connected for this business." };
  const { data: chats } = await db.from("wa_contacts").select("id, opted_out_at").in("account_id", ids).eq("wa_id", key);
  if (!chats?.length) return { error: "This person has not written on WhatsApp yet, so there is no chat to record it on." };
  if (on && chats.some((c) => c.opted_out_at)) return { error: "This guest sent STOP. They can only be added again if they send START." };

  const at = new Date().toISOString();
  const patch = on
    ? { marketing_opt_in_at: at, marketing_opt_in_source: "staff", marketing_opt_in_by: (ctx.user.email ?? "").slice(0, 200) || "portal user" }
    : { marketing_opt_in_at: null, marketing_opt_in_source: null, marketing_opt_in_by: null };
  const { error } = await db.from("wa_contacts").update(patch).in("id", chats.map((c) => c.id as string));
  if (error) return { error: "Couldn't save that." };
  await db.from("portal_contacts").update({ marketing_opt_in_at: on ? at : null, updated_at: at }).eq("id", contactId);
  revalidatePath("/portal/contacts");
  return { ok: true as const };
}
