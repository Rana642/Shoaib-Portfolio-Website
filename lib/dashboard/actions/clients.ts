"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db";
import { getUser } from "../auth";

const clientSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  contact_person: z.string().max(200).optional().nullable(),
  email: z.string().email().max(320).optional().or(z.literal("")),
  phone: z.string().max(50).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  currency: z.string().max(10).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  is_active: z.boolean().optional(),
});

// Projects/sub-companies the client runs, entered inline on the create form.
// (On edit, these are managed one-by-one via ClientProjectsManager instead.)
const projectsSchema = z
  .array(
    z.object({
      name: z.string().min(1).max(200),
      notes: z.string().max(2000).nullable().optional(),
    })
  )
  .max(50);

/** Reads the create form's serialized projects list. Malformed input is
 *  ignored rather than blocking client creation. */
function parseProjects(formData: FormData): { name: string; notes: string | null }[] {
  const raw = formData.get("projects");
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = projectsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    return parsed.data.map((p) => ({ name: p.name, notes: p.notes ?? null }));
  } catch {
    return [];
  }
}

/** Every action re-checks auth: server actions are public endpoints, so
 *  middleware alone is not a sufficient guard. */
async function assertAuthed() {
  const user = await getUser();
  if (!user) redirect("/dashboard/login");
}

function parseForm(formData: FormData) {
  return clientSchema.safeParse({
    name: formData.get("name"),
    contact_person: formData.get("contact_person") || null,
    email: formData.get("email") || "",
    phone: formData.get("phone") || null,
    address: formData.get("address") || null,
    country: formData.get("country") || null,
    currency: formData.get("currency") || null,
    notes: formData.get("notes") || null,
    is_active: formData.get("is_active") === "on",
  });
}

export async function createClient(formData: FormData) {
  await assertAuthed();
  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { email, ...rest } = parsed.data;
  const { data: created, error } = await db
    .from("clients")
    .insert({ ...rest, email: email || null })
    .select("id")
    .single();
  if (error) return { error: error.message };

  // Insert any projects entered inline on the form, preserving their order.
  const projects = parseProjects(formData);
  if (created && projects.length > 0) {
    const rows = projects.map((p, i) => ({
      client_id: created.id,
      name: p.name,
      notes: p.notes,
      sort_order: i,
    }));
    const { error: projErr } = await db.from("client_projects").insert(rows);
    if (projErr) {
      // The client itself saved — don't lose it; the projects can be added
      // on the client's edit page.
      return {
        error: `Client saved, but its projects couldn't be added (${projErr.message}). Add them from the client's page.`,
      };
    }
  }

  revalidatePath("/dashboard/clients");
  redirect("/dashboard/clients");
}

export async function updateClient(id: string, formData: FormData) {
  await assertAuthed();
  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { email, ...rest } = parsed.data;
  const { error } = await db
    .from("clients")
    .update({ ...rest, email: email || null })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/clients");
  redirect("/dashboard/clients");
}

export async function deleteClient(id: string) {
  await assertAuthed();

  // The FK from quotations/invoices is ON DELETE RESTRICT, so Postgres
  // refuses this if the client has documents. Surface that as plain
  // language rather than a raw constraint error.
  const { error } = await db.from("clients").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return {
        error:
          "This client has quotations or invoices, so it can't be deleted. Mark it inactive instead.",
      };
    }
    return { error: error.message };
  }

  revalidatePath("/dashboard/clients");
  return { ok: true };
}
