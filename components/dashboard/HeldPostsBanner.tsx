import Link from "next/link";
import { heldPostsSummary, type HeldSummary } from "@/lib/social-connection-hold";

const pkt = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

/**
 * Shown on every dashboard page while Meta has the Facebook login blocked
 * and posts are held (lib/social-connection-hold.ts). Disappears by itself
 * once the held posts go out.
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
    <div role="alert" className="mb-6 rounded-lg border border-red-600/20 bg-red-500/10 px-4 py-3 text-small text-red-700 print:hidden">
      <p className="font-semibold">
        Facebook connection blocked{summary.since ? ` since ${pkt(summary.since)}` : ""} — {summary.count} post
        {summary.count === 1 ? "" : "s"} on hold
        {summary.projects.length ? ` (${summary.projects.join(", ")})` : ""}.
      </p>
      <p className="mt-1">
        Log in at facebook.com with the profile that connected the Pages, finish the security check, then reconnect it
        on the Social page. The held posts then go out by themselves.{" "}
        <Link href="/dashboard/social" className="font-semibold underline underline-offset-2">
          Open Social
        </Link>
      </p>
    </div>
  );
}
