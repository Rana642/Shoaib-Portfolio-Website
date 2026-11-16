// Numbers that were connected in Socially Snap and only linked here (wa_accounts.via_socially_snap).
// This site holds no Meta token for them; everything that would call Meta goes through the API.
// Pure helpers, so the rules are tested without a database.

import { clientFromEnv, sociallySnapMode, type Client, type Env } from "./client";
import { failureText } from "./send";

export const NO_META_TOKEN =
  "This number is connected through Socially Snap, so this site holds no Meta token for it. Do this in the Socially Snap dashboard.";

const DIGITS = /^[0-9]{5,25}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PlatformNumber = {
  phoneNumberId: string;
  wabaId: string;
  displayPhone: string;
  name: string | null;
  canSend: boolean;
};

/** Reads Socially Snap's GET /v1/phone_numbers answer. Rows without usable ids are dropped. */
export function toPlatformNumbers(rows: unknown[]): PlatformNumber[] {
  const out: PlatformNumber[] = [];
  for (const row of rows) {
    const r = row as Record<string, unknown> | null;
    if (!r || typeof r.phone_number_id !== "string" || typeof r.waba_id !== "string") continue;
    if (!DIGITS.test(r.phone_number_id) || !DIGITS.test(r.waba_id)) continue;
    out.push({
      phoneNumberId: r.phone_number_id,
      wabaId: r.waba_id,
      displayPhone: typeof r.display_phone_number === "string" ? r.display_phone_number : "",
      name: typeof r.verified_name === "string" ? r.verified_name : null,
      canSend: r.can_send === true,
    });
  }
  return out;
}

/** The workspace's connected numbers, as Socially Snap reports them (the only source of ids here). */
export async function platformNumbers(client: Client = clientForLinked(false)): Promise<PlatformNumber[]> {
  const r = await client.phoneNumbers();
  if (!r.ok) throw new Error(failureText(r.failure));
  return toPlatformNumbers(r.data);
}

export type LinkChoice = { number: PlatformNumber; projectId: string; label: string | null };

/**
 * What Shoaib picked in "Link a Socially Snap number": a number from the API's own list (so ids are
 * never typed) and a hotel project. A number the workspace doesn't have is refused.
 */
export function chooseLink(raw: { phone_number_id?: unknown; project_id?: unknown; label?: unknown }, available: PlatformNumber[]): { value: LinkChoice } | { error: string } {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const projectId = text(raw.project_id);
  if (!UUID.test(projectId)) return { error: "Choose the hotel this number belongs to." };
  const number = available.find((n) => n.phoneNumberId === text(raw.phone_number_id));
  if (!number) return { error: "That number isn't connected in Socially Snap (Ads By Shoaib workspace). Connect it there first." };
  return { value: { number, projectId, label: text(raw.label).slice(0, 80) || null } };
}

/**
 * The API client for a linked number. Writes (create or delete a template) need live mode: in test
 * mode a "success" is a dry run, and in off mode the number can't be reached at all.
 */
export function clientForLinked(write: boolean, env: Env = process.env, fetchImpl?: typeof fetch): Client {
  const mode = sociallySnapMode(env);
  if (mode !== "live" && !(mode === "test" && !write)) {
    throw new Error("This number works only through Socially Snap. Set WHATSAPP_VIA_SOCIALLY_SNAP to live in Vercel.");
  }
  const client = clientFromEnv(env, fetchImpl);
  if ("failure" in client) throw new Error(failureText(client.failure));
  return client;
}

export async function listTemplatesViaSociallySnap(from: string, client: Client = clientForLinked(false)): Promise<unknown[]> {
  const r = await client.listTemplates(from);
  if (!r.ok) throw new Error(failureText(r.failure));
  return r.data;
}

/** `template` is Meta's own body (name, language, category, components); `from` picks the number. */
export async function createTemplateViaSociallySnap(from: string, template: Record<string, unknown>, client: Client = clientForLinked(true)): Promise<{ status: string }> {
  const r = await client.createTemplate({ ...template, from });
  if (!r.ok) throw new Error(failureText(r.failure));
  if (r.test) throw new Error("Socially Snap answered as a test; the template was not submitted.");
  return { status: r.status };
}

export async function deleteTemplateViaSociallySnap(from: string, name: string, client: Client = clientForLinked(true)): Promise<void> {
  const r = await client.deleteTemplate(name, from);
  if (!r.ok) throw new Error(failureText(r.failure));
}
