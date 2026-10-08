"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Package,
  FileText,
  Receipt,
  Inbox,
  Send,
  FileSignature,
  ClipboardList,
  FolderInput,
  KeyRound,
  Plug,
  CalendarDays,
  Repeat,
  FileBarChart,
  BarChart3,
  Megaphone,
  MessageCircle,
  BedDouble,
  MessageSquareText,
  Contact,
  MapPin,
  Link2,
  ScrollText,
  Settings as SettingsIcon,
  PenSquare,
  LogOut,
  Menu,
  X,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export type NavItem =
  /** A small heading that starts a group (a thin divider on the icon rail). */
  | { section: string }
  | { href: string; label: string; icon: LucideIcon; exact?: boolean }
  | { label: string; icon: LucideIcon; children: { href: string; label: string }[] };

// Ordered to match the actual funnel: a lead comes in, gets a proposal,
// accepts, signs an agreement, onboards, then becomes a billed client.
const DASHBOARD_NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { section: "Sales" },
  { href: "/dashboard/leads", label: "Leads", icon: Inbox },
  { href: "/dashboard/proposals", label: "Proposals", icon: Send },
  { href: "/dashboard/agreements", label: "Agreements", icon: FileSignature },
  { href: "/dashboard/onboarding", label: "Onboarding", icon: ClipboardList },
  { href: "/dashboard/intakes", label: "Intakes", icon: FolderInput },
  { section: "Clients & billing" },
  { href: "/dashboard/clients", label: "Clients", icon: Users },
  {
    label: "Services Catalog",
    icon: Package,
    children: [
      { href: "/dashboard/catalog", label: "Single Services" },
      { href: "/dashboard/catalog/bundles", label: "Bundle Services" },
    ],
  },
  { href: "/dashboard/quotations", label: "Quotations", icon: FileText },
  { href: "/dashboard/invoices", label: "Invoices", icon: Receipt },
  { href: "/dashboard/retainers", label: "Retainers", icon: Repeat },
  { href: "/dashboard/reports", label: "Reports", icon: FileBarChart },
  { href: "/dashboard/letterhead", label: "Letterhead", icon: ScrollText },
  { section: "Marketing" },
  { href: "/dashboard/social/planner", label: "Planner", icon: CalendarDays },
  { href: "/dashboard/social/insights", label: "Insights", icon: BarChart3 },
  { href: "/dashboard/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { href: "/dashboard/bookings", label: "Bookings", icon: BedDouble },
  { href: "/dashboard/inquiries", label: "Hotel inquiries", icon: MessageSquareText },
  { href: "/dashboard/contacts", label: "Guest contacts", icon: Contact },
  { href: "/dashboard/ads", label: "Meta Ads", icon: Megaphone },
  { href: "/dashboard/gbp", label: "Google Business", icon: MapPin },
  { href: "/dashboard/social", label: "Connections", icon: Link2, exact: true },
  { section: "Admin" },
  { href: "/dashboard/vault", label: "Password Vault", icon: KeyRound },
  { href: "/dashboard/api-vault", label: "API Vault", icon: Plug },
  { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
];

export default function Sidebar({
  email,
  collapsed = false,
  onToggle,
  nav = DASHBOARD_NAV,
  homeHref = "/dashboard",
  areaLabel = "Dashboard",
  loginHref = "/dashboard/login",
  showStudio = true,
}: {
  email: string;
  /** Desktop-only icon rail. Mobile always renders the full drawer. */
  collapsed?: boolean;
  onToggle?: () => void;
  /** The client portal reuses this sidebar with its own items. */
  nav?: NavItem[];
  homeHref?: string;
  /** Small caption under the logo ("Dashboard" / "Client portal"). */
  areaLabel?: string;
  /** Where signing out lands. */
  loginHref?: string;
  /** The Sanity "Website Content" link — Shoaib's dashboard only. */
  showStudio?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const signOut = async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.signOut();
    router.push(loginHref);
    router.refresh();
  };

  // A group's own route is "active" if the current path is under any of its
  // children's base paths.
  const isGroupRoute = (children: { href: string }[]) =>
    children.some((c) => pathname === c.href || pathname.startsWith(`${c.href}/`));

  // A specific child is active if the path is under its base path AND no
  // sibling with a more specific (longer) href also matches — e.g. under
  // "Services Catalog", "/dashboard/catalog/bundles/x" should highlight
  // "Bundle Services", not both entries.
  const isChildActive = (children: { href: string }[], href: string) => {
    if (pathname === href) return true;
    if (!pathname.startsWith(`${href}/`)) return false;
    const moreSpecificSibling = children.some(
      (c) => c.href !== href && c.href.startsWith(href) && pathname.startsWith(c.href)
    );
    return !moreSpecificSibling;
  };

  // `rail` = the desktop collapsed icon-only state. The mobile drawer
  // passes rail=false so it always shows full labels.
  const renderNav = (rail: boolean) => {

    return (
      <>
        <div className={cn("py-6 shrink-0", rail ? "px-3" : "px-5")}>
          <div className={cn("flex items-center", rail ? "justify-center" : "justify-between")}>
            {rail ? (
              <Link href={homeHref} title="Ads by Shoaib">
                <Image src="/brand/mark.svg" alt="Ads by Shoaib" width={28} height={30} className="size-7" />
              </Link>
            ) : (
              <Link href={homeHref} aria-label="Ads by Shoaib home">
                <Image src="/brand/logo-horizontal-light.svg" alt="Ads by Shoaib" width={168} height={55} className="h-8 w-auto" />
              </Link>
            )}
            {onToggle && (
              <button
                type="button"
                onClick={onToggle}
                aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
                title={rail ? "Expand sidebar" : "Collapse sidebar"}
                className={cn(
                  "hidden lg:flex items-center justify-center size-8 rounded-lg text-cloud/50 hover:text-cloud hover:bg-cloud/10 transition-colors cursor-pointer",
                  rail && "mt-3"
                )}
              >
                {rail ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
              </button>
            )}
          </div>
          {!rail && (
            <p className="font-mono uppercase text-tag tracking-widest text-cloud/30 mt-2">
              {areaLabel}
            </p>
          )}
        </div>

        <nav className={cn("sidebar-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-1 pb-4", rail ? "px-2" : "px-3")}>
          {nav.map((item) => {
            if ("section" in item) {
              return rail ? (
                <div key={item.section} className="my-3 mx-2 border-t border-cloud/10" aria-hidden />
              ) : (
                <p key={item.section} className="px-3 pt-5 pb-1.5 font-mono uppercase text-[10px] tracking-widest text-cloud/35">
                  {item.section}
                </p>
              );
            }
            if ("children" in item) {
              const groupActive = isGroupRoute(item.children);
              // Collapsed rail can't show a dropdown legibly — the group
              // becomes a single icon linking to its first page instead.
              if (rail) {
                return (
                  <Link
                    key={item.label}
                    href={item.children[0].href}
                    onClick={() => setOpen(false)}
                    title={item.label}
                    className={cn(
                      "flex items-center justify-center rounded-lg py-2.5 transition-colors",
                      groupActive
                        ? "bg-citrus text-ink"
                        : "text-cloud/60 hover:text-cloud hover:bg-cloud/5"
                    )}
                  >
                    <item.icon className="size-4 shrink-0" aria-hidden />
                  </Link>
                );
              }
              const showChildren = !rail && (openGroups[item.label] || groupActive);
              return (
                <div key={item.label}>
                  <button
                    type="button"
                    onClick={() => setOpenGroups((prev) => ({ ...prev, [item.label]: !prev[item.label] }))}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-small transition-colors cursor-pointer",
                      groupActive
                        ? "text-cloud font-medium"
                        : "text-cloud/60 hover:text-cloud hover:bg-cloud/5"
                    )}
                  >
                    <item.icon className="size-4 shrink-0" aria-hidden />
                    {item.label}
                    <ChevronDown
                      className={cn(
                        "size-3.5 shrink-0 ml-auto transition-transform",
                        showChildren ? "rotate-180" : ""
                      )}
                      aria-hidden
                    />
                  </button>
                  {showChildren && (
                    <div className="mt-1 ml-4 pl-3 border-l border-cloud/10 space-y-1">
                      {item.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "block rounded-lg px-3 py-2 text-small transition-colors",
                            isChildActive(item.children, child.href)
                              ? "bg-citrus text-ink font-medium"
                              : "text-cloud/60 hover:text-cloud hover:bg-cloud/5"
                          )}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                title={rail ? item.label : undefined}
                className={cn(
                  "flex items-center rounded-lg text-small transition-colors",
                  rail ? "justify-center py-2.5" : "gap-3 px-3 py-2.5",
                  active
                    ? "bg-citrus text-ink font-medium"
                    : "text-cloud/60 hover:text-cloud hover:bg-cloud/5"
                )}
              >
                <item.icon className="size-4 shrink-0" aria-hidden />
                {!rail && item.label}
              </Link>
            );
          })}

          {showStudio && (
          <div className="pt-4 mt-4 border-t border-cloud/10">
            {/* Blog and case studies stay in Sanity — richer editor for
                long-form content than anything worth rebuilding here. */}
            <a
              href="/studio"
              target="_blank"
              rel="noopener noreferrer"
              title={rail ? "Website Content (Sanity)" : undefined}
              className={cn(
                "flex items-center rounded-lg text-small text-cloud/60 hover:text-cloud hover:bg-cloud/5 transition-colors",
                rail ? "justify-center py-2.5" : "gap-3 px-3 py-2.5"
              )}
            >
              <PenSquare className="size-4 shrink-0" aria-hidden />
              {!rail && (
                <>
                  Website Content
                  <span className="ml-auto font-mono text-[9px] uppercase tracking-widest text-cloud/30">
                    Sanity
                  </span>
                </>
              )}
            </a>
          </div>
          )}
        </nav>

        <div className={cn("py-4 shrink-0 border-t border-cloud/10", rail ? "px-2" : "px-3")}>
          {!rail && <p className="px-3 text-small text-cloud/40 truncate mb-2">{email}</p>}
          <button
            onClick={signOut}
            title={rail ? "Sign out" : undefined}
            className={cn(
              "w-full flex items-center rounded-lg text-small text-cloud/60 hover:text-cloud hover:bg-cloud/5 transition-colors cursor-pointer",
              rail ? "justify-center py-2.5" : "gap-3 px-3 py-2.5"
            )}
          >
            <LogOut className="size-4 shrink-0" aria-hidden />
            {!rail && "Sign out"}
          </button>
        </div>
      </>
    );
  };

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden print:hidden fixed top-0 inset-x-0 z-50 h-14 glass-dark backdrop-blur-xl backdrop-saturate-150 border-b border-cloud/10 flex items-center justify-between px-4">
        <Link href={homeHref} aria-label="Ads by Shoaib home">
          <Image src="/brand/logo-horizontal-light.svg" alt="Ads by Shoaib" width={168} height={55} className="h-7 w-auto" />
        </Link>
        <button
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close menu" : "Open menu"}
          className="flex items-center justify-center size-11 text-cloud"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile drawer — always full width, never the collapsed rail */}
      {open && (
        <div className="lg:hidden print:hidden fixed inset-0 top-14 z-40 glass-dark backdrop-blur-xl backdrop-saturate-150 flex flex-col">
          {renderNav(false)}
        </div>
      )}

      {/* Desktop sidebar — collapses to an icon rail */}
      <aside
        className={cn(
          // Plain-value widths (not w-20/w-64, which compile to
          // calc(var(--spacing) * n)) — some browsers can't interpolate a
          // width transition between two calc()/var() endpoints and it
          // stalls at the start value. Literal rem endpoints animate fine.
          "hidden lg:flex fixed inset-y-0 left-0 z-30 glass-dark backdrop-blur-xl backdrop-saturate-150 border-r border-cloud/10 flex-col transition-[width] duration-300 ease-out",
          collapsed ? "w-[5rem]" : "w-[16rem]"
        )}
      >
        {renderNav(collapsed)}
      </aside>
    </>
  );
}
