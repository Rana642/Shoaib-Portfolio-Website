import "server-only";
import { db } from "./dashboard/db";
import { encryptField } from "./api-vault-crypto";
import { whatsappCredential } from "./whatsapp";

/**
 * Embedded Signup (incl. coexistence: a number that stays on the WhatsApp
 * Business app). The browser hands us the 30-second code plus the WABA and
 * phone number ids; we exchange the code for the customer's business token,
 * subscribe our app to their WABA (webhooks), store the number with its own
 * encrypted token, and — for coexistence — ask for the contacts + 6 months
 * of chat history (allowed once, within 24 h of onboarding).
 */
const GRAPH = "https://graph.facebook.com/v23.0";

async function graph<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GRAPH}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `Graph error ${res.status}`);
  return json;
}

export async function completeEmbeddedSignup(input: { code: string; wabaId: string; phoneNumberId: string; coexistence: boolean }) {
  const cred = await whatsappCredential();
  const q = new URLSearchParams({ client_id: cred.app_id, client_secret: cred.app_secret, code: input.code });
  const res = await fetch(`${GRAPH}/oauth/access_token?${q}`);
  const tok = (await res.json()) as { access_token?: string; error?: { message?: string } };
  if (!res.ok || !tok.access_token) throw new Error(`Couldn't finish sign-up: ${tok.error?.message ?? res.status}`);
  const token = tok.access_token;

  const phone = await graph<{ display_phone_number?: string; verified_name?: string }>(
    `${input.phoneNumberId}?fields=display_phone_number,verified_name`,
    token
  );
  await graph(`${input.wabaId}/subscribed_apps`, token, { method: "POST" });

  const { data: account, error } = await db
    .from("wa_accounts")
    .upsert(
      {
        phone_number_id: input.phoneNumberId,
        waba_id: input.wabaId,
        display_phone: phone.display_phone_number ?? null,
        label: phone.verified_name ?? null,
        access_token_enc: encryptField(token),
        onboarded_at: new Date().toISOString(),
      },
      { onConflict: "phone_number_id" }
    )
    .select("id")
    .single();
  if (error || !account) throw new Error(error?.message ?? "Couldn't save the number.");

  const sync: Record<string, unknown> = {};
  if (input.coexistence) {
    for (const type of ["smb_app_state_sync", "history"] as const) {
      try {
        sync[type] = await graph(`${input.phoneNumberId}/smb_app_data`, token, {
          method: "POST",
          body: JSON.stringify({ messaging_product: "whatsapp", sync_type: type }),
        });
      } catch (e) {
        sync[type] = { error: e instanceof Error ? e.message : String(e) };
      }
    }
    await db.from("wa_accounts").update({ sync_requests: sync }).eq("id", account.id);
  }
  return { accountId: account.id as string, display: phone.display_phone_number ?? input.phoneNumberId, sync };
}
