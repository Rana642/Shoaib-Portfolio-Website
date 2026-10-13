import "server-only";

/**
 * Exchange rates into PKR from fawazahmed0's free currency-api (no key, daily
 * updates; listed in Shoaib's public-apis fork), with its mirror as a
 * fallback. It's the open-market mid rate — a bank's card rate is usually a
 * little higher, which is why every form keeps the PKR amount editable.
 */
const sources = (date: string) => [
  `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.min.json`,
  `https://${date}.currency-api.pages.dev/v1/currencies/usd.min.json`,
];

const FALLBACK_USD_PKR = 280;

/** All rates against USD for a day ("latest" = today). Past days never change, so they cache for a week. */
async function usdTable(date: string): Promise<{ usd: Record<string, number>; date: string | null } | null> {
  for (const url of sources(date)) {
    try {
      const res = await fetch(url, {
        next: { revalidate: date === "latest" ? 6 * 3600 : 7 * 86400 },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { date?: string; usd?: Record<string, number> };
      const pkr = json.usd?.pkr;
      if (json.usd && pkr && pkr > 100 && pkr < 1000) return { usd: json.usd, date: json.date ?? null };
    } catch {
      // try the next source
    }
  }
  return null;
}

export async function usdToPkr(): Promise<{ rate: number; date: string | null; live: boolean }> {
  const table = await usdTable("latest");
  if (!table) return { rate: FALLBACK_USD_PKR, date: null, live: false };
  return { rate: Math.round(table.usd.pkr * 100) / 100, date: table.date, live: true };
}

/**
 * PKR for 1 unit of each currency, on a given day (YYYY-MM-DD) or today.
 * A future or unavailable day falls back to today's rates; if the API is
 * down, USD falls back to a fixed rate and other currencies are missing
 * (callers then ask for the PKR amount by hand).
 */
export async function pkrRates(
  currencies: readonly string[],
  date?: string | null
): Promise<{ rates: Record<string, number>; date: string | null; live: boolean }> {
  const today = new Date().toISOString().slice(0, 10);
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date < today ? date : "latest";
  const table = (await usdTable(day)) ?? (day === "latest" ? null : await usdTable("latest"));

  const rates: Record<string, number> = { PKR: 1 };
  if (!table) {
    rates.USD = FALLBACK_USD_PKR;
    return { rates, date: null, live: false };
  }
  for (const code of currencies) {
    const perUsd = table.usd[code.toLowerCase()];
    if (code === "PKR" || !perUsd) continue;
    rates[code] = Math.round((table.usd.pkr / perUsd) * 10000) / 10000;
  }
  return { rates, date: table.date, live: true };
}

/** PKR for 1 unit of one currency on a day — null when it can't be found. */
export async function pkrRate(currency: string, date?: string | null): Promise<number | null> {
  if (currency === "PKR") return 1;
  const { rates } = await pkrRates([currency], date);
  return rates[currency] ?? null;
}
