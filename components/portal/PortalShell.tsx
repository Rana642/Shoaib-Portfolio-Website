"use client";

import { LayoutDashboard } from "lucide-react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import type { NavItem } from "@/components/dashboard/Sidebar";
import { portalSections, type PortalLink } from "@/lib/portal/sections";

export type { PortalLink };

/** The client portal in the dashboard's own shell (glass sidebar, same
 *  pages feel), grouped into sections like the dashboard. The server layout
 *  decides which links someone gets from their features — icons can't cross
 *  the server/client boundary, so sections are built here. */
export default function PortalShell({ email, links, children }: { email: string; links: PortalLink[]; children: React.ReactNode }) {
  const sections = portalSections(links);
  const nav: NavItem[] = [
    { href: "/portal", label: "Home", icon: LayoutDashboard, exact: true },
    ...sections.map((s) => ({ href: s.groups[0].items[0].href, label: s.label, icon: s.icon, match: s.match })),
  ];
  return (
    <DashboardShell email={email} portal={{ nav, sections }}>
      {children}
    </DashboardShell>
  );
}
