"use client";

import { useMemo, useState } from "react";
import { Card, inputClasses } from "@/components/dashboard/ui";
import { FREE_SERVICE_PER_NUMBER, RATE_SOURCE, WHATSAPP_RATES } from "@/lib/whatsapp-rates";

type Currency = "PKR" | "USD";

const CATEGORIES = [
  { key: "marketing", col: 1, label: "Marketing", hint: "Offers, broadcasts, promotions" },
  { key: "utility", col: 2, label: "Utility", hint: "Order / booking confirmations, reminders, updates" },
  { key: "authentication", col: 3, label: "Authentication", hint: "OTP / login codes" },
  { key: "service", col: 4, label: "Service", hint: "Replies to a customer who messaged first" },
] as const;
type Category = (typeof CATEGORIES)[number]["key"];

/**
 * Monthly WhatsApp bill at Meta's own rates (any business, any market), with
 * the 1,000-free-service-messages-per-number tier and an optional resale margin.
 */
export default function PricingCalculator() {
  const [market, setMarket] = useState("Pakistan");
  const [currency, setCurrency] = useState<Currency>("PKR");
  const [usdToPkr, setUsdToPkr] = useState(280);
  const [numbers, setNumbers] = useState(1);
  const [margin, setMargin] = useState(0);
  const [volume, setVolume] = useState<Record<Category, number>>({ marketing: 0, utility: 300, authentication: 0, service: 1500 });

  const row = WHATSAPP_RATES.find((r) => r[0] === market) ?? WHATSAPP_RATES[0];
  const toCur = (usd: number) => (currency === "USD" ? usd : usd * usdToPkr);
  const freeService = FREE_SERVICE_PER_NUMBER * numbers;

  const lines = useMemo(
    () =>
      CATEGORIES.map((c) => {
        const rate = toCur(row[c.col]);
        const billable = c.key === "service" ? Math.max(0, volume.service - freeService) : volume[c.key];
        return { ...c, count: volume[c.key], billable, rate, cost: billable * rate };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [row, currency, usdToPkr, volume, freeService]
  );

  const total = lines.reduce((s, l) => s + l.cost, 0);
  const withMargin = total * (1 + margin / 100);
  const fmt = (n: number, digits = 2) =>
    `${currency === "PKR" ? "Rs " : "$"}${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px] items-start">
      <Card className="p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <label className="text-small sm:col-span-2 xl:col-span-2">
            <span className="block text-ink-muted mb-1">Customer&apos;s country</span>
            <select value={market} onChange={(e) => setMarket(e.target.value)} className={inputClasses}>
              {WHATSAPP_RATES.map((r) => (
                <option key={r[0]} value={r[0]}>
                  {r[0]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-small">
            <span className="block text-ink-muted mb-1">Currency</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className={inputClasses}>
              <option value="PKR">PKR (Rs)</option>
              <option value="USD">USD ($)</option>
            </select>
          </label>
          {currency === "PKR" ? (
            <label className="text-small">
              <span className="block text-ink-muted mb-1">1 USD = Rs</span>
              <input
                type="number"
                min={1}
                value={usdToPkr}
                onChange={(e) => setUsdToPkr(Math.max(1, Number(e.target.value) || 0))}
                className={inputClasses}
              />
            </label>
          ) : null}
          <label className="text-small">
            <span className="block text-ink-muted mb-1">WhatsApp numbers</span>
            <input
              type="number"
              min={1}
              max={50}
              value={numbers}
              onChange={(e) => setNumbers(Math.min(50, Math.max(1, Math.floor(Number(e.target.value) || 1))))}
              className={inputClasses}
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full mt-6 text-small min-w-[520px]">
            <thead>
              <tr className="text-left text-ink-muted border-b border-ink/10">
                <th className="py-2 font-normal">Message type</th>
                <th className="py-2 font-normal w-32">Messages / month</th>
                <th className="py-2 font-normal text-right">Per message</th>
                <th className="py-2 font-normal text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key} className="border-b border-ink/5">
                  <td className="py-3 pr-3">
                    <span className="font-medium">{l.label}</span>
                    <span className="block text-tag text-ink-subtle">{l.hint}</span>
                    {l.key === "service" && (
                      <span className="block text-tag text-forest">
                        First {freeService.toLocaleString("en-US")} free — {l.billable.toLocaleString("en-US")} charged
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-3">
                    <input
                      type="number"
                      min={0}
                      value={l.count}
                      onChange={(e) => setVolume((v) => ({ ...v, [l.key]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                      className={`${inputClasses} !py-1.5`}
                      aria-label={`${l.label} messages per month`}
                    />
                  </td>
                  <td className="py-3 text-right tabular-nums">{fmt(l.rate, 4)}</td>
                  <td className="py-3 text-right tabular-nums">{fmt(l.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="mt-5 space-y-1.5 text-tag text-ink-subtle list-disc pl-4">
          <li>Charged per delivered message, by the customer&apos;s country code.</li>
          <li>Each WhatsApp number gets {FREE_SERVICE_PER_NUMBER.toLocaleString("en-US")} free service messages a month (no roll-over).</li>
          <li>Chats that start from a Click-to-WhatsApp ad are free for 72 hours — every message type.</li>
          <li>Utility templates sent while the 24-hour reply window is open are free.</li>
          <li>Messages typed in the WhatsApp Business app on the phone are not billed by the API.</li>
        </ul>
      </Card>

      <Card className="p-6 lg:sticky lg:top-6">
        <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">Monthly cost</p>
        <p className="text-h3 font-medium tabular-nums mt-1">{fmt(total)}</p>
        <p className="text-small text-ink-muted">≈ {fmt(total / 30)} per day</p>

        <label className="block text-small mt-6">
          <span className="block text-ink-muted mb-1">Your margin %</span>
          <input
            type="number"
            min={0}
            max={500}
            value={margin}
            onChange={(e) => setMargin(Math.min(500, Math.max(0, Number(e.target.value) || 0)))}
            className={inputClasses}
          />
        </label>
        {margin > 0 && (
          <div className="mt-4 rounded-lg bg-citrus/15 border border-citrus/40 p-4">
            <p className="text-small text-ink-muted">Charge the client</p>
            <p className="text-body-lg font-medium tabular-nums">{fmt(withMargin)}</p>
            <p className="text-tag text-ink-subtle">Your profit {fmt(withMargin - total)} / month</p>
          </div>
        )}

        <p className="text-tag text-ink-subtle mt-6">Rates: {RATE_SOURCE}. Markets not listed are billed at their &ldquo;Rest of …&rdquo; region or &ldquo;Other&rdquo;.</p>
      </Card>
    </div>
  );
}
