"use client";

import { BedDouble, CalendarDays, FileText, LayoutDashboard, MessageCircle, Users } from "lucide-react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import type { NavItem } from "@/components/dashboard/Sidebar";

export type PortalLink = "whatsapp" | "bookings" | "planner" | "intakes" | "team";

const ITEMS: Record<PortalLink, NavItem> = {
  whatsapp: { href: "/portal/whatsapp", label: "WhatsApp", icon: MessageCircle },
  bookings: { href: "/portal/bookings", label: "Bookings", icon: BedDouble },
  planner: { href: "/portal/planner", label: "Planner", icon: CalendarDays },
  intakes: { href: "/portal/intakes", label: "Intake forms", icon: FileText },
  team: { href: "/portal/team", label: "Team", icon: Users },
};

/** The client portal in the dashboard's own shell (glass sidebar, same
 *  pages feel). The server layout decides which links someone gets from
 *  their features — icons can't cross the server/client boundary, so they
 *  are attached here. */
export default function PortalShell({ email, links, children }: { email: string; links: PortalLink[]; children: React.ReactNode }) {
  const nav: NavItem[] = [{ href: "/portal", label: "Home", icon: LayoutDashboard, exact: true }, ...links.map((l) => ITEMS[l])];
  return (
    <DashboardShell email={email} portal={{ nav }}>
      {children}
    </DashboardShell>
  );
}
