import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Client portal", template: "%s — Client portal" },
  robots: { index: false, follow: false },
};

/** The client portal: a private area for clients, separate from both the
 *  marketing site and Shoaib's dashboard (see proxy.ts for the guard). */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-cloud text-ink">{children}</div>;
}
