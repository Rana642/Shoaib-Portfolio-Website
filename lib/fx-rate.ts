import "server-only";

/**
 * Today's USD → PKR rate from fawazahmed0's free currency-api (no key, daily
 * updates; listed in Shoaib's public-apis fork), with its mirror as a
 * fallback. Cached for 6 hours. It's the open-market mid rate — a bank's card
 * rate is usually a little higher, which is why the calculators keep the
 * rate editable.
 */
const SOURCES = [
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json",
  "https://latest.currency-api.pages.dev/v1/currencies/usd.min.json",
];

export async function usdToPkr(): Promise<{ rate: number; date: string | null; live: boolean }> {
  for (const url of SOURCES) {
    try {
      const res = await fetch(url, { next: { revalidate: 6 * 3600 }, signal: AbortSignal.timeout(3000) });
      if (!res.ok) continue;
      const json = (await res.json()) as { date?: string; usd?: Record<string, number> };
      const rate = json.usd?.pkr;
      if (rate && rate > 100 && rate < 1000) return { rate: Math.round(rate * 100) / 100, date: json.date ?? null, live: true };
    } catch {
      // try the next source
    }
  }
  return { rate: 280, date: null, live: false };
}
