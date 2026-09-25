"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db";
import { getUser } from "../auth";
import { generateNumber } from "../numbering";

async function assertAuthed() {
  const user = await getUser();
  if (!user) redirect("/dashboard/login");
}

const letterSchema = z.object({
  title: z.string().trim().max(200, "Keep the title under 200 characters"),
  letter_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  show_meta: z.boolean(),
  body: z.string().max(200_000, "This letter is too long to save"),
});

export type LetterInput = z.infer<typeof letterSchema>;

export type SaveLetterResult =
  | { ok: true; id: string; ref_no: string; updated_at: string }
  | { error: string };

// PostgREST's "table not in schema cache" — the letters table hasn't been
// created yet (supabase/dashboard-schema.sql, "Letters" section).
const MISSING_TABLE = "PGRST205";
const SETUP_MESSAGE =
  "Letters aren't set up in the database yet — run the “Letters” section of supabase/dashboard-schema.sql in the Supabase SQL Editor.";

/**
 * Creates the letter when `id` is null, otherwise updates it. This is what
 * the editor's autosave calls, so it deliberately neither revalidates nor
 * redirects: re-rendering the page mid-typing would reset the editor. The
 * list page is force-dynamic, so it's fresh on the next visit regardless.
 */
export async function saveLetter(id: string | null, input: LetterInput): Promise<SaveLetterResult> {
  await assertAuthed();

  const parsed = letterSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (id) {
    if (!z.string().uuid().safeParse(id).success) return { error: "Letter not found" };
    const { data, error } = await db
      .from("letters")
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, ref_no, updated_at")
      .maybeSingle();
    if (error) return { error: error.code === MISSING_TABLE ? SETUP_MESSAGE : error.message };
    if (!data) return { error: "This letter was deleted — duplicate it or start a new one." };
    return { ok: true, ...data };
  }

  // Check the table exists before reserving a reference number, so saving
  // before setup doesn't burn LTR numbers on inserts that can't succeed.
  const { error: probeError } = await db.from("letters").select("id").limit(1);
  if (probeError) return { error: probeError.code === MISSING_TABLE ? SETUP_MESSAGE : probeError.message };

  const ref_no = await generateNumber("letter", "LTR");
  if (!ref_no) return { error: "Couldn't generate a reference number. Check the database setup." };

  const { data, error } = await db
    .from("letters")
    .insert({ ...parsed.data, ref_no })
    .select("id, ref_no, updated_at")
    .single();
  if (error) return { error: error.message };
  return { ok: true, ...data };
}

export async function deleteLetter(id: string) {
  await assertAuthed();

  const { error } = await db.from("letters").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/letterhead");
  redirect("/dashboard/letterhead");
}
