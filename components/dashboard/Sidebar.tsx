"use client";

import { useState } from "react";
import Link from "next/link";
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

type NavItem =
  | { href: string; label: string; icon: LucideIcon; exact?: boolean }
  | { label: string; icon: LucideIcon; children: { href: string; label: string }[] };

// Ordered to match the actual funnel: a lead comes in, gets a proposal,
// accepts, signs an agreement, onboards, then becomes a billed client.
const nav: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/leads", label: "Leads", icon: Inbox },
  { href: "/dashboard/proposals", label: "Proposals", icon: Send },
  { href: "/dashboard/agreements", label: "Agreements", icon: FileSignature },
  { href: "/dashboard/onboarding", label: "Onboarding", icon: ClipboardList },
  { href: "/dashboard/intakes", label: "Intakes", icon: FolderInput },
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
  { href: "/dashboard/vault", label: "Vault", icon: KeyRound },
  { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
];

export default function Sidebar({
  email,
  collapsed = false,
  onToggle,
}: {
  email: string;
  /** Desktop-only icon rail. Mobile always renders the full drawer. */
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const isCatalogRoute = pathname.startsWith("/dashboard/catalog");

  const signOut = async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.signOut();
    router.push("/dashboard/login");
    router.refresh();
  };

  const isCatalogChildActive = (href: string) =>
    href === "/dashboard/catalog"
      ? pathname === "/dashboard/catalog" ||
        (pathname.startsWith("/dashboard/catalog/") && !pathname.startsWith("/dashboard/catalog/bundles"))
      : pathname.startsWith(href);

  // `rail` = the desktop collapsed icon-only state. The mobile drawer
  // passes rail=false so it always shows full labels.
  const renderNav = (rail: boolean) => {
    const showCatalogChildren = !rail && (catalogOpen || isCatalogRoute);

    return (
      <>
        <div className={cn("py-6", rail ? "px-3" : "px-5")}>
          <div className={cn("flex items-center", rail ? "justify-center" : "justify-between")}>
            {rail ? (
              <Link
                href="/dashboard"
                className="font-serif italic text-xl text-cloud"
                title="ads by shoaib"
              >
                a<span className="text-citrus not-italic font-sans font-bold">.</span>
              </Link>
            ) : (
              <Link href="/dashboard" className="font-serif italic text-xl text-cloud">
                ads by shoaib<span className="text-citrus not-italic font-sans font-bold">.</span>
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
              Dashboard
            </p>
          )}
        </div>

        <nav className={cn("flex-1 space-y-1", rail ? "px-2" : "px-3")}>
          {nav.map((item) => {
            if ("children" in item) {
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
                      isCatalogRoute
                        ? "bg-citrus text-ink"
                        : "text-cloud/60 hover:text-cloud hover:bg-cloud/5"
                    )}
                  >
                    <item.icon className="size-4 shrink-0" aria-hidden />
                  </Link>
                );
              }
              return (
                <div key={item.label}>
                  <button
                    type="button"
                    onClick={() => setCatalogOpen((prev) => !prev)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-small transition-colors cursor-pointer",
                      isCatalogRoute
                        ? "text-cloud font-medium"
                        : "text-cloud/60 hover:text-cloud hover:bg-cloud/5"
                    )}
                  >
                    <item.icon className="size-4 shrink-0" aria-hidden />
                    {item.label}
                    <ChevronDown
                      className={cn(
                        "size-3.5 shrink-0 ml-auto transition-transform",
                        showCatalogChildren ? "rotate-180" : ""
                      )}
                      aria-hidden
                    />
                  </button>
                  {showCatalogChildren && (
                    <div className="mt-1 ml-4 pl-3 border-l border-cloud/10 space-y-1">
                      {item.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "block rounded-lg px-3 py-2 text-small transition-colors",
                            isCatalogChildActive(child.href)
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
        </nav>

        <div className={cn("py-4 border-t border-cloud/10", rail ? "px-2" : "px-3")}>
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
      <div className="lg:hidden fixed top-0 inset-x-0 z-50 h-14 glass-dark backdrop-blur-xl backdrop-saturate-150 border-b border-cloud/10 flex items-center justify-between px-4">
        <Link href="/dashboard" className="font-serif italic text-lg text-cloud">
          ads by shoaib<span className="text-citrus not-italic font-sans font-bold">.</span>
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
        <div className="lg:hidden fixed inset-0 top-14 z-40 glass-dark backdrop-blur-xl backdrop-saturate-150 flex flex-col">
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
