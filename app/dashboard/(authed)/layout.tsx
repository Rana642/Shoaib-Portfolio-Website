import type { Metadata } from "next";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { getUser } from "@/lib/dashboard/auth";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s — Dashboard" },
  robots: { index: false, follow: false },
};

/**
 * Wraps only the authenticated pages. /dashboard/login sits outside this
 * route group deliberately — putting it inside would make this layout's
 * redirect fire on the login page itself and loop forever.
 */
export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const user = await getUser();

  // Middleware already guards these routes; this is a second check so a
  // middleware misconfiguration fails closed rather than leaking data.
  if (!user) redirect("/dashboard/login");

  return <DashboardShell email={user.email ?? ""}>{children}</DashboardShell>;
}
