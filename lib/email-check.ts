import "server-only";

/**
 * Catches fake or mistyped emails before they become leads, subscribers or
 * portal logins — via Disify (free, no key; listed in Shoaib's public-apis
 * fork). Flags temporary inboxes (mailinator…), domains with no mail server,
 * and common typos (gmial.com → gmail.com).
 * Fail-open: if Disify is slow or down, the email is accepted — a real lead
 * must never be lost because a checker had a bad day.
 */
type Disify = { format?: boolean; dns?: boolean; disposable?: boolean; typo_suggestion?: string };

export type EmailCheck = { ok: true } | { ok: false; message: string; suggestion?: string };

export async function checkEmail(email: string): Promise<EmailCheck> {
  const clean = email.trim().toLowerCase();
  try {
    const res = await fetch(`https://disify.com/api/email/${encodeURIComponent(clean)}`, {
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    if (!res.ok) return { ok: true };
    const d = (await res.json()) as Disify;
    if (d.format === false) return { ok: false, message: "That email doesn't look right." };
    if (d.dns === false) {
      // No mail server: usually a typo (gmial.com) — suggest the fix when Disify has one.
      if (d.typo_suggestion) {
        const suggestion = `${clean.split("@")[0]}@${d.typo_suggestion}`;
        return { ok: false, message: `Did you mean ${suggestion}?`, suggestion };
      }
      return { ok: false, message: "That email domain can't receive mail — please check the spelling." };
    }
    if (d.disposable) return { ok: false, message: "Please use your real email — temporary inboxes can't receive my reply." };
    return { ok: true };
  } catch {
    return { ok: true };
  }
}
