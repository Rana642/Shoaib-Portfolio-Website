// Client for the Socially Snap WhatsApp API (https://docs.sociallysnap.app). Server side only: it
// holds an API key. Nothing here is used unless WHATSAPP_VIA_SOCIALLY_SNAP is "test" or "live";
// "off" (the default) leaves every WhatsApp call going straight to Meta, as before.
//
// Rules this file keeps (see docs/specs/phase-5-step-1.md in the sociallysnap-platform repo):
// - A send that may have gone out (timeout, network failure, 502) is reported, never retried.
// - A dry run (the API answers "test": true, from an ss_test_ key) is never a real message.
// - A key is never logged or put in an error.

export type Mode = "off" | "test" | "live";

const BASE_URL = "https://api.sociallysnap.app";
const SEND_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_TEMPLATE_PAGES = 5;

export type Env = Record<string, string | undefined>;

/**
 * Unset or empty means off. A value that is set but isn't off, test or live ("TEST " is fine,
 * "tset" is not) is "invalid", which refuses to send: a typo must never fall back to Meta.
 */
export function sociallySnapMode(env: Env = process.env): Mode | "invalid" {
  const value = (env.WHATSAPP_VIA_SOCIALLY_SNAP ?? "").trim().toLowerCase();
  if (value === "" || value === "off") return "off";
  return value === "test" || value === "live" ? value : "invalid";
}

/**
 * Whether unattended sending (broadcasts, automatic replies) may run. Off: as before. Live: only
 * with a usable live key. Test and invalid: no, because a dry run would use up every recipient's
 * one chance and every automatic reply's one-shot flag without sending anything.
 */
export function unattendedSendingAllowed(env: Env = process.env): boolean {
  const mode = sociallySnapMode(env);
  if (mode === "off") return true;
  return mode === "live" && !("failure" in clientFromEnv(env));
}

export type FailureCode =
  | "invalid_request"
  | "unauthorized"
  | "not_found"
  | "number_unavailable"
  | "recipient_opted_out"
  | "rate_limited"
  | "internal_error"
  | "meta_rejected"
  | "meta_unavailable"
  | "not_configured"
  | "timeout"
  | "network"
  | "bad_response";

export interface Failure {
  code: FailureCode;
  message: string;
  status: number | null;
  /** Meta's own error code, when Meta refused the request. */
  metaCode: number | null;
  retryAfterSeconds: number | null;
  /** True when Meta may have acted on the request: show it, never send it again on your own. */
  mayHaveSent: boolean;
}

export type Result<T> = ({ ok: true; test: boolean } & T) | { ok: false; failure: Failure };

export interface Client {
  sendMessage(body: Record<string, unknown>): Promise<Result<{ wamid: string }>>;
  uploadMedia(file: Blob, filename: string, from?: string): Promise<Result<{ id: string }>>;
  // `from` is the number to use when the workspace has several (its Meta phone number id).
  mediaDetails(id: string, from?: string): Promise<Result<{ details: Record<string, unknown> }>>;
  downloadMedia(id: string, from?: string): Promise<Result<{ bytes: ArrayBuffer; contentType: string }>>;
  listTemplates(from?: string): Promise<Result<{ data: unknown[]; hasMore: boolean }>>;
  createTemplate(body: Record<string, unknown>): Promise<Result<{ id: string; status: string }>>;
  deleteTemplate(name: string, from?: string): Promise<Result<{ success: boolean }>>;
  phoneNumbers(): Promise<Result<{ data: unknown[] }>>;
}

export interface ClientOptions {
  apiKey: string;
  fetch?: typeof fetch;
  baseUrl?: string;
}

const fromQuery = (from: string | undefined, first: "?" | "&") => (from ? `${first}from=${encodeURIComponent(from)}` : "");

const failure = (code: FailureCode, message: string, extra: Partial<Failure> = {}): { ok: false; failure: Failure } => ({
  ok: false,
  failure: { code, message, status: null, metaCode: null, retryAfterSeconds: null, mayHaveSent: false, ...extra },
});

// The same dry-run sentence everywhere, so staff see one thing: the API checked the message and
// nothing was sent or stored.
export const DRY_RUN_MESSAGE = "Socially Snap test mode: the message passed every check, but nothing was sent.";

export function clientFromEnv(env: Env = process.env, fetchImpl?: typeof fetch): Client | { ok: false; failure: Failure } {
  const mode = sociallySnapMode(env);
  if (mode === "off") return failure("not_configured", "Socially Snap is switched off.");
  if (mode === "invalid") return failure("not_configured", "WHATSAPP_VIA_SOCIALLY_SNAP must be off, test or live. Nothing was sent.");
  const apiKey = mode === "test" ? env.SOCIALLYSNAP_API_KEY_TEST : env.SOCIALLYSNAP_API_KEY_LIVE;
  const expected = mode === "test" ? "ss_test_" : "ss_live_";
  if (!apiKey || !apiKey.startsWith(expected)) {
    return failure("not_configured", `Socially Snap ${mode} mode needs SOCIALLYSNAP_API_KEY_${mode.toUpperCase()} (an ${expected}… key).`);
  }
  return createClient({ apiKey, fetch: fetchImpl });
}

interface ApiError {
  error?: { code?: string; message?: string; meta?: { code?: number | null } };
}

const CODES = new Set<string>(["invalid_request", "unauthorized", "not_found", "number_unavailable", "recipient_opted_out", "rate_limited", "internal_error", "meta_rejected", "meta_unavailable"]);

export function createClient({ apiKey, fetch: fetchImpl = fetch, baseUrl = BASE_URL }: ClientOptions): Client {
  async function call(method: string, path: string, init: { json?: unknown; form?: FormData; timeoutMs?: number; sends?: boolean } = {}): Promise<{ ok: true; response: Response } | { ok: false; failure: Failure }> {
    const headers: Record<string, string> = { "X-API-Key": apiKey };
    let body: BodyInit | undefined;
    if (init.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(init.json);
    } else if (init.form) {
      body = init.form;
    }
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, { method, headers, body, signal: AbortSignal.timeout(init.timeoutMs ?? SEND_TIMEOUT_MS), cache: "no-store" });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      return failure(timedOut ? "timeout" : "network", timedOut ? "Socially Snap didn't answer in time." : "Couldn't reach Socially Snap.", { mayHaveSent: init.sends === true });
    }
    if (response.ok) return { ok: true, response };

    const parsed = (await response.json().catch(() => null)) as ApiError | null;
    const known = parsed?.error?.code && CODES.has(parsed.error.code) ? (parsed.error.code as FailureCode) : null;
    const retry = Number(response.headers.get("retry-after"));
    return failure(known ?? "bad_response", parsed?.error?.message ?? `Socially Snap answered ${response.status}.`, {
      status: response.status,
      metaCode: typeof parsed?.error?.meta?.code === "number" ? parsed.error.meta.code : null,
      retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? retry : null,
      // A 5xx on a send can come after Meta accepted it (502 meta_unavailable, or a 500 thrown while
      // answering), and an answer we can't read says nothing: either way it may have gone out.
      mayHaveSent: init.sends === true && (response.status >= 500 || known === null),
    });
  }

  async function json<T>(r: { ok: true; response: Response }, read: (body: Record<string, unknown>) => T | null, sends = false): Promise<Result<T extends object ? T : never>> {
    const body = (await r.response.json().catch(() => null)) as Record<string, unknown> | null;
    const value = body ? read(body) : null;
    if (!body || value === null) return failure("bad_response", "Socially Snap's answer wasn't what was expected.", { status: r.response.status, mayHaveSent: sends }) as never;
    return { ok: true, test: body.test === true, ...value } as never;
  }

  return {
    async sendMessage(message) {
      const r = await call("POST", "/v1/messages", { json: message, sends: true });
      if (!r.ok) return r;
      return json(r, (body) => {
        const id = (body.messages as { id?: unknown }[] | undefined)?.[0]?.id;
        return typeof id === "string" ? { wamid: id } : null;
      }, true);
    },
    async uploadMedia(file, filename, from) {
      const form = new FormData();
      form.append("file", file, filename);
      if (from) form.append("from", from);
      const r = await call("POST", "/v1/media", { form, timeoutMs: DOWNLOAD_TIMEOUT_MS });
      if (!r.ok) return r;
      return json(r, (body) => (typeof body.id === "string" ? { id: body.id } : null));
    },
    async mediaDetails(id, from) {
      const r = await call("GET", `/v1/media/${encodeURIComponent(id)}${fromQuery(from, "?")}`);
      if (!r.ok) return r;
      return json(r, (body) => ({ details: body }));
    },
    async downloadMedia(id, from) {
      const r = await call("GET", `/v1/media/${encodeURIComponent(id)}/download${fromQuery(from, "?")}`, { timeoutMs: DOWNLOAD_TIMEOUT_MS });
      if (!r.ok) return r;
      try {
        return { ok: true, test: false, bytes: await r.response.arrayBuffer(), contentType: r.response.headers.get("content-type") ?? "application/octet-stream" };
      } catch (error) {
        const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        return failure(timedOut ? "timeout" : "network", timedOut ? "Socially Snap didn't finish sending the file in time." : "The file download was interrupted.");
      }
    },
    // The API pages at 100; up to MAX_TEMPLATE_PAGES are read, and hasMore says if there was more.
    async listTemplates(from) {
      const data: unknown[] = [];
      let after: string | null = null;
      for (let page = 0; page < MAX_TEMPLATE_PAGES; page++) {
        const r = await call("GET", `/v1/templates?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}${fromQuery(from, "&")}`);
        if (!r.ok) return r;
        const body = (await r.response.json().catch(() => null)) as { data?: unknown; paging?: { after?: string | null; has_more?: boolean } } | null;
        if (!body || !Array.isArray(body.data)) return failure("bad_response", "Socially Snap's answer wasn't what was expected.", { status: r.response.status });
        data.push(...body.data);
        if (body.paging?.has_more === true && !body.paging.after) return { ok: true, test: false, data, hasMore: true };
        after = body.paging?.has_more === true ? (body.paging.after ?? null) : null;
        if (!after) return { ok: true, test: false, data, hasMore: false };
      }
      return { ok: true, test: false, data, hasMore: true };
    },
    async createTemplate(template) {
      const r = await call("POST", "/v1/templates", { json: template });
      if (!r.ok) return r;
      return json(r, (body) => (typeof body.id === "string" ? { id: body.id, status: String(body.status ?? "") } : null));
    },
    async deleteTemplate(name, from) {
      const r = await call("DELETE", `/v1/templates?name=${encodeURIComponent(name)}${fromQuery(from, "&")}`);
      if (!r.ok) return r;
      return json(r, (body) => ({ success: body.success === true }));
    },
    async phoneNumbers() {
      const r = await call("GET", "/v1/phone_numbers");
      if (!r.ok) return r;
      return json(r, (body) => (Array.isArray(body.data) ? { data: body.data } : null));
    },
  };
}

/** A plain text message in Meta's shape. `from` is the number to send from (its Meta phone number id). */
export const textMessage = (to: string, text: string, from?: string) => ({
  messaging_product: "whatsapp",
  to,
  type: "text",
  text: { body: text },
  ...(from ? { from } : {}),
});

/** An approved template with body variables only (what the inbox and broadcasts send today). */
export const templateMessage = (to: string, name: string, language: string, values: string[], from?: string) => ({
  messaging_product: "whatsapp",
  to,
  type: "template",
  template: {
    name,
    language: { code: language },
    ...(values.length ? { components: [{ type: "body", parameters: values.map((text) => ({ type: "text", text })) }] } : {}),
  },
  ...(from ? { from } : {}),
});
