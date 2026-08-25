"use server";

import { z } from "zod";
import { db } from "../db";
import type { OnboardingIntake } from "../types";

export async function getIntakeByToken(
  token: string
): Promise<{ intake: OnboardingIntake; clientName: string } | null> {
  const { data: intake } = await db
    .from("onboarding_intakes")
    .select("*, clients(name)")
    .eq("access_token", token)
    .maybeSingle();

  if (!intake) return null;
  const { clients, ...rest } = intake as OnboardingIntake & { clients: { name: string } | null };
  return { intake: rest, clientName: clients?.name ?? "" };
}

const intakeSchema = z.object({
  business_overview: z.string().max(5000).optional().nullable(),
  current_channels: z.string().max(5000).optional().nullable(),
  goals: z.string().max(5000).optional().nullable(),
  brand_assets_links: z.string().max(2000).optional().nullable(),
  access_notes: z.string().max(2000).optional().nullable(),
  additional_notes: z.string().max(5000).optional().nullable(),
});

/** Public — no `assertAuthed()`. Validated by `access_token` alone, same
 *  pattern as the proposal public actions. */
export async function submitIntake(token: string, formData: FormData) {
  const { data: intake } = await db
    .from("onboarding_intakes")
    .select("id, status")
    .eq("access_token", token)
    .maybeSingle();

  if (!intake) return { error: "This onboarding link isn't valid." };
  if (intake.status === "submitted") return { error: "This form has already been submitted." };

  const parsed = intakeSchema.safeParse({
    business_overview: formData.get("business_overview") || null,
    current_channels: formData.get("current_channels") || null,
    goals: formData.get("goals") || null,
    brand_assets_links: formData.get("brand_assets_links") || null,
    access_notes: formData.get("access_notes") || null,
    additional_notes: formData.get("additional_notes") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await db
    .from("onboarding_intakes")
    .update({ ...parsed.data, status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", intake.id);
  if (error) return { error: error.message };

  return { ok: true };
}
