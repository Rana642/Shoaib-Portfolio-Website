import "server-only";
import { db } from "./dashboard/db";
import { markReplied, tokenForAccount } from "./whatsapp";
import { countVars, fillVars, validateTemplate, type TemplateInput, type WaTemplate } from "./whatsapp-template-shared";

/**
 * WhatsApp message templates — the only way to message a customer outside
 * the 24-hour reply window (and to start a conversation). Templates live in
 * Meta (per WhatsApp Business Account), not in our DB: Meta reviews each one
 * (usually minutes, up to 24 h) and only APPROVED ones can be sent.
 * Marketing templates cost more than utility ones — see /dashboard/whatsapp/pricing.
 */
const GRAPH = "https://graph.facebook.com/v23.0";

async function graph<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GRAPH}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; error_user_msg?: string } };
  if (!res.ok) throw new Error(json.error?.error_user_msg ?? json.error?.message ?? `WhatsApp API error (${res.status})`);
  return json;
}

async function wabaFor(accountId: string) {
  const { data } = await db.from("wa_accounts").select("waba_id").eq("id", accountId).maybeSingle();
  if (!data?.waba_id) throw new Error("This number has no WhatsApp Business Account id — reconnect it.");
  return { waba: data.waba_id as string, token: await tokenForAccount(accountId) };
}

type GraphComponent = {
  type: string;
  format?: string;
  text?: string;
  buttons?: { type: string; text: string; url?: string }[];
};
type GraphTemplate = {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  rejected_reason?: string;
  components?: GraphComponent[];
};

function toTemplate(t: GraphTemplate): WaTemplate {
  const c = (type: string) => t.components?.find((x) => x.type === type);
  const header = c("HEADER");
  const body = c("BODY")?.text ?? "";
  return {
    id: t.id,
    name: t.name,
    language: t.language,
    category: t.category,
    status: t.status,
    rejectedReason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null,
    header: header?.format === "TEXT" ? (header.text ?? null) : header ? `[${header.format?.toLowerCase()}]` : null,
    body,
    footer: c("FOOTER")?.text ?? null,
    buttons: (c("BUTTONS")?.buttons ?? []).map((b) => ({ type: b.type, text: b.text, url: b.url })),
    vars: countVars(body),
    sendable:
      (t.components ?? []).every((x) => ["HEADER", "BODY", "FOOTER", "BUTTONS"].includes(x.type)) &&
      (!header || header.format === "TEXT") &&
      !/\{\{/.test(header?.text ?? "") &&
      !(c("BUTTONS")?.buttons ?? []).some((b) => /\{\{/.test(b.url ?? "")),
  };
}

/** Every template on the number's WhatsApp Business Account (newest first). */
export async function listTemplates(accountId: string, approvedOnly = false): Promise<WaTemplate[]> {
  const { waba, token } = await wabaFor(accountId);
  const fields = "id,name,language,category,status,rejected_reason,components";
  const json = await graph<{ data: GraphTemplate[] }>(`${waba}/message_templates?fields=${fields}&limit=200`, token);
  const all = json.data.map(toTemplate);
  return approvedOnly ? all.filter((t) => t.status === "APPROVED" && t.category !== "AUTHENTICATION" && t.sendable) : all;
}

/** Submit a new template for Meta's review. */
export async function createTemplate(accountId: string, input: TemplateInput) {
  const problem = validateTemplate(input);
  if (problem) return { error: problem };
  const { waba, token } = await wabaFor(accountId);

  const components: Record<string, unknown>[] = [];
  if (input.header.trim()) components.push({ type: "HEADER", format: "TEXT", text: input.header.trim() });
  const n = countVars(input.body);
  components.push({
    type: "BODY",
    text: input.body.trim(),
    ...(n ? { example: { body_text: [input.examples.slice(0, n).map((e) => e.trim())] } } : {}),
  });
  if (input.footer.trim()) components.push({ type: "FOOTER", text: input.footer.trim() });
  const buttons = [
    ...input.quickReplies.filter((q) => q.trim()).map((text) => ({ type: "QUICK_REPLY", text: text.trim() })),
    ...(input.urlButton ? [{ type: "URL", text: input.urlButton.text.trim(), url: input.urlButton.url.trim() }] : []),
  ];
  if (buttons.length) components.push({ type: "BUTTONS", buttons });

  try {
    const res = await graph<{ id: string; status: string }>(`${waba}/message_templates`, token, {
      method: "POST",
      body: JSON.stringify({ name: input.name, category: input.category, language: input.language, components }),
    });
    return { ok: true, status: res.status };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Meta didn't accept the template." };
  }
}

export async function deleteTemplate(accountId: string, name: string) {
  if (!/^[a-z0-9_]{1,512}$/.test(name)) return { error: "Unknown template." };
  const { waba, token } = await wabaFor(accountId);
  try {
    await graph(`${waba}/message_templates?name=${encodeURIComponent(name)}`, token, { method: "DELETE" });
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't delete it." };
  }
}

/** Send an approved template in a chat — works whether or not the 24 h window is open. */
export async function sendTemplate(contactId: string, name: string, language: string, params: string[]) {
  const { data: contact } = await db.from("wa_contacts").select("id, account_id, opted_out_at").eq("id", contactId).single();
  if (!contact) return { error: "Chat not found." };
  if (contact.opted_out_at) return { error: "This customer sent STOP — don't send them templates unless they message again." };

  // Re-read the template from Meta so the stored text matches what was sent.
  const template = (await listTemplates(contact.account_id as string, true)).find((t) => t.name === name && t.language === language);
  if (!template) return { error: "That template isn't approved (or was deleted)." };
  const values = params.slice(0, template.vars).map((p) => p.trim().slice(0, 500));
  if (values.length < template.vars || values.some((v) => !v)) return { error: "Fill in every variable." };

  const r = await deliverTemplate(contactId, template, values);
  return "error" in r ? { error: r.error } : { ok: true };
}

/**
 * Send one template message and store it in the chat. A broadcast send only
 * moves the chat's last-message time; a staff send also marks the chat
 * replied / Intervened.
 */
export async function deliverTemplate(
  contactId: string,
  template: Pick<WaTemplate, "name" | "language" | "category" | "header" | "body" | "footer">,
  values: string[],
  opts: { broadcast?: boolean } = {}
): Promise<{ wamid: string } | { error: string }> {
  const { data: contact } = await db
    .from("wa_contacts")
    .select("id, wa_id, wa_accounts(id, phone_number_id)")
    .eq("id", contactId)
    .single();
  if (!contact) return { error: "Chat not found." };
  const account = contact.wa_accounts as unknown as { id: string; phone_number_id: string };

  const token = await tokenForAccount(account.id);
  const res = await fetch(`${GRAPH}/${account.phone_number_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: contact.wa_id,
      type: "template",
      template: {
        name: template.name,
        language: { code: template.language },
        ...(values.length ? { components: [{ type: "body", parameters: values.map((text) => ({ type: "text", text })) }] } : {}),
      },
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
  const wamid = json.messages?.[0]?.id;
  if (!res.ok || !wamid) return { error: json.error?.message ?? `WhatsApp API error (${res.status})` };

  const body = [template.header, fillVars(template.body, values), template.footer].filter(Boolean).join("\n\n");
  const at = new Date().toISOString();
  await db.from("wa_messages").insert({
    account_id: account.id,
    contact_id: contact.id,
    wamid,
    direction: "out",
    via: opts.broadcast ? "broadcast" : "api",
    type: "template",
    body,
    status: "sent",
    sent_at: at,
    raw: { template: template.name, language: template.language, category: template.category },
  });
  if (opts.broadcast) await db.from("wa_contacts").update({ last_message_at: at }).eq("id", contact.id);
  else await markReplied(contact.id, at);
  return { wamid };
}

/** The WhatsApp account a chat belongs to (for listing its templates). */
export async function accountOfChat(contactId: string) {
  const { data } = await db.from("wa_contacts").select("account_id").eq("id", contactId).maybeSingle();
  return (data?.account_id as string | undefined) ?? null;
}
