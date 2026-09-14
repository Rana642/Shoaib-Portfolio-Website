"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db";
import { getUser } from "../auth";

async function assertAuthed() {
  const user = await getUser();
  if (!user) redirect("/dashboard/login");
}

const clientProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(200),
  notes: z.string().max(2000).optional().nullable(),
  posting_instructions: z.string().max(4000).optional().nullable(),
});

export async function createClientProject(clientId: string, formData: FormData) {
  await assertAuthed();

  const parsed = clientProjectSchema.safeParse({
    name: formData.get("name"),
    notes: formData.get("notes") || null,
    posting_instructions: formData.get("posting_instructions") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { count } = await db
    .from("client_projects")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId);

  const { error } = await db.from("client_projects").insert({
    client_id: clientId,
    name: parsed.data.name,
    notes: parsed.data.notes,
    posting_instructions: parsed.data.posting_instructions,
    sort_order: count ?? 0,
  });
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/clients/${clientId}`);
  return { ok: true };
}

export async function deleteClientProject(id: string) {
  await assertAuthed();

  const { data: project } = await db.from("client_projects").select("client_id").eq("id", id).single();

  const { error } = await db.from("client_projects").delete().eq("id", id);
  if (error) return { error: error.message };

  if (project) revalidatePath(`/dashboard/clients/${project.client_id}`);
  return { ok: true };
}

/** Updates just the posting style guide on an existing project — the field
 *  Shoaib actually revisits over time, unlike the name. */
export async function updateProjectPostingInstructions(id: string, text: string) {
  await assertAuthed();

  const parsed = z.string().max(4000).safeParse(text);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { data: project, error } = await db
    .from("client_projects")
    .update({ posting_instructions: parsed.data || null })
    .eq("id", id)
    .select("client_id")
    .single();
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/clients/${project.client_id}`);
  return { ok: true };
}
