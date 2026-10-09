import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { pakistanHolidays } from "./holidays";
import { cityForecast } from "./weather";
import { checkDomainEmail } from "./domain-email-check";

/**
 * Free, key-less helpers from Shoaib's public-apis fork (2026-10-09):
 * Pakistan holidays (caldays), city weather (Open-Meteo) and a domain email
 * setup check (MX / SPF / DKIM / DMARC via public DNS). For planning posts
 * and ads, and for client audits.
 */
const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const ok = (text: string, structured?: Record<string, unknown>) => ({
  content: [{ type: "text" as const, text }],
  ...(structured ? { structuredContent: structured } : {}),
});
const fail = (error: unknown) => ({
  content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
  isError: true as const,
});

export function registerUtilityTools(server: McpServer): void {
  server.registerTool(
    "pk_holidays",
    {
      title: "Pakistan public holidays",
      description: `Lists Pakistan's public holidays for the current year (caldays.com), so posts and offers can be planned around them. Eid / Ashura / Milad dates depend on the moon sighting and may shift by a day — they're marked "expected".

Args:
  - upcoming_only (boolean, default true): only today and later.`,
      inputSchema: { upcoming_only: z.boolean().optional() },
      annotations: READ,
    },
    async ({ upcoming_only = true }: { upcoming_only?: boolean }) => {
      try {
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
        const list = (await pakistanHolidays()).filter((h) => !upcoming_only || h.date >= today);
        if (!list.length) return ok("No holidays found (the source may be down, or none are left this year).");
        const text = list.map((h) => `${h.date}  ${h.name}${h.moon ? " (expected — moon sighting)" : ""}`).join("\n");
        return ok(text, { holidays: list });
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "weather_forecast",
    {
      title: "City weather forecast",
      description: `Daily forecast for a city (Open-Meteo), up to 16 days: max/min °C, condition and rain chance. Use it to plan posts or ad angles around heat, rain, fog or cold (e.g. "AC rooms" in a Multan heatwave).

Args:
  - city (string): e.g. "Multan" or "Lahore, Pakistan".
  - days (number, 1–16, default 7).`,
      inputSchema: { city: z.string().min(2).max(80), days: z.number().int().min(1).max(16).optional() },
      annotations: READ,
    },
    async ({ city, days = 7 }: { city: string; days?: number }) => {
      try {
        const f = await cityForecast(city, days);
        if (!f) return fail(`Couldn't find a forecast for "${city}".`);
        const text = [
          `Forecast for ${f.place}:`,
          ...f.days.map((d) => `${d.date}  ${d.emoji} ${d.label}, ${d.max}° / ${d.min}°, rain ${d.rain}%`),
        ].join("\n");
        return ok(text, f);
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "domain_email_check",
    {
      title: "Domain email setup check",
      description: `Checks whether a domain's email is set up to land in the inbox: MX (receives mail), SPF (one record, not +all), DKIM (key on common selectors) and DMARC (policy). Returns a 0–100 score and a fix for each problem. Good for client audits and our own sending domain.

Args:
  - domain (string): e.g. "adsbyshoaib.com" (a URL is fine too).`,
      inputSchema: { domain: z.string().min(3).max(253) },
      annotations: READ,
    },
    async ({ domain }: { domain: string }) => {
      try {
        const r = await checkDomainEmail(domain);
        const text = [
          `${r.domain}: ${r.score}/100`,
          ...r.items.map((i) => `${i.ok ? (i.warn ? "⚠" : "✓") : "✗"} ${i.name} — ${i.advice}${i.value ? `\n    ${i.value}` : ""}`),
        ].join("\n");
        return ok(text, r);
      } catch (error) {
        return fail(error);
      }
    }
  );
}
