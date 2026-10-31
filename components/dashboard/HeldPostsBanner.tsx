import Link from "next/link";
import {
  blockedAccountsLine,
  blockedLoginFix,
  blockedLoginTitle,
  heldPostsSummary,
  type HeldSummary,
} from "@/lib/social-connection-hold";

const pkt = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

/**
 * Shown on every dashboard page while Meta has a login blocked and posts are
 * held (lib/social-connection-hold.ts) — one alert per blocked profile, naming
 * it and the accounts it holds up, so it's clear which login to fix.
 * Disappears by itself once the held posts go out.
 */
export default async function HeldPostsBanner() {
  let summary: HeldSummary;
  try {
    summary = await heldPostsSummary();
  } catch {
    return null; // never let the banner break the dashboard
  }
  if (!summary.count) return null;

  return (
    <div className="mb-6 space-y-3 print:hidden">
      {summary.logins.map((login) => (
        <div
          key={`${login.kind}:${login.name ?? ""}`}
          role="alert"
          className="rounded-lg border border-red-600/20 bg-red-500/10 px-4 py-3 text-small text-red-700"
        >
          <p className="font-semibold">
            {blockedLoginTitle(login)} is blocked since {pkt(login.since)} — {login.count} post{login.count === 1 ? "" : "s"} on hold.
          </p>
          <p className="mt-1">{blockedAccountsLine(login)}</p>
          <p className="mt-1">
            {blockedLoginFix(login)} The held posts then go out by themselves.{" "}
            <Link href="/dashboard/social" className="font-semibold underline underline-offset-2">
              Open Integrations
            </Link>
          </p>
        </div>
      ))}
    </div>
  );
}
