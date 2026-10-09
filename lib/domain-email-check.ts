import "server-only";
import { promises as dns } from "node:dns";

/**
 * Is a domain set up to send email that lands in the inbox? Checks MX, SPF,
 * DMARC and DKIM straight from public DNS (Node's resolver — the AGPC
 * checker from the public-apis fork didn't answer, and DNS needs no API).
 * Used for our own sending domain (invoices, reports) and in client audits.
 */
export type CheckItem = { name: string; ok: boolean; warn?: boolean; value: string | null; advice: string };

const DKIM_SELECTORS = [
  "resend",
  "google",
  "default",
  "selector1",
  "selector2",
  "k1",
  "s1",
  "s2",
  "mail",
  "dkim",
  "hostingermail1",
  "hostingermail2",
  "zoho",
];

async function txt(name: string): Promise<string[]> {
  try {
    return (await dns.resolveTxt(name)).map((parts) => parts.join(""));
  } catch {
    return [];
  }
}

export function cleanDomain(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];
}

export async function checkDomainEmail(input: string): Promise<{ domain: string; score: number; items: CheckItem[] }> {
  const domain = cleanDomain(input);
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) throw new Error("Enter a domain like example.com");

  const [mx, root, dmarcTxt, dkimHits] = await Promise.all([
    dns.resolveMx(domain).catch(() => [] as { exchange: string; priority: number }[]),
    txt(domain),
    txt(`_dmarc.${domain}`),
    Promise.all(
      DKIM_SELECTORS.map(async (s) => ((await txt(`${s}._domainkey.${domain}`)).some((t) => /v=DKIM1|p=/i.test(t)) ? s : null))
    ),
  ]);

  const spf = root.filter((t) => t.toLowerCase().startsWith("v=spf1"));
  const dmarc = dmarcTxt.find((t) => t.toLowerCase().startsWith("v=dmarc1")) ?? null;
  const policy = dmarc?.match(/;\s*p=(\w+)/i)?.[1]?.toLowerCase() ?? null;
  const dkim = dkimHits.filter((s): s is string => !!s);
  const plusAll = spf.length === 1 && /\+all/.test(spf[0]);

  const items: CheckItem[] = [
    {
      name: "MX — receives mail",
      ok: mx.length > 0,
      value: mx.length ? [...mx].sort((a, b) => a.priority - b.priority).map((m) => m.exchange).join(", ") : null,
      advice: mx.length ? "Mail servers are set." : "No MX records — this domain can't receive email.",
    },
    {
      name: "SPF — who may send",
      ok: spf.length === 1,
      warn: plusAll,
      value: spf.join(" | ") || null,
      advice:
        spf.length === 0
          ? "Add one SPF TXT record listing your senders, e.g. v=spf1 include:_spf.google.com ~all"
          : spf.length > 1
            ? "There are several SPF records — merge them into ONE, otherwise receivers ignore them all."
            : plusAll
              ? "SPF ends in +all, which lets anyone send as you — change it to ~all or -all."
              : "SPF is set.",
    },
    {
      name: "DKIM — signed mail",
      ok: dkim.length > 0,
      value: dkim.length ? `selector: ${dkim.join(", ")}` : null,
      advice: dkim.length
        ? "A DKIM key was found."
        : "No DKIM key on the common selectors. If the mail provider uses its own selector this can be a false alarm — check its DNS page.",
    },
    {
      name: "DMARC — policy",
      ok: !!dmarc && policy !== null,
      warn: policy === "none",
      value: dmarc,
      advice: !dmarc
        ? "Add a DMARC TXT record at _dmarc, e.g. v=DMARC1; p=none; rua=mailto:you@yourdomain — Gmail and Yahoo expect it."
        : policy === "none"
          ? "DMARC only monitors (p=none). Once reports look clean, move to p=quarantine."
          : `DMARC policy: ${policy}.`,
    },
  ];
  const score = Math.round((items.filter((i) => i.ok && !i.warn).length / items.length) * 100);
  return { domain, score, items };
}
