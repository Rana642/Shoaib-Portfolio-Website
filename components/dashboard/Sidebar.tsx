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
  Settings as SettingsIcon,
  PenSquare,
  LogOut,
  Menu,
  X,
  ChevronDown,
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
  { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
];

export default function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const isCatalogRoute = pathname.startsWith("/dashboard/catalog");
  const showCatalogChildren = catalogOpen || isCatalogRoute;

  const signOut = async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.signOut();
    router.push("/dashboard/login");
    router.refresh();
  };

  const navContent = (
    <>
      <div className="px-5 py-6">
        <Link href="/dashboard" className="font-serif italic text-xl text-cloud">
          ads by shoaib<span className="text-citrus not-italic font-sans font-bold">.</span>
        </Link>
        <p className="font-mono uppercase text-tag tracking-widest text-cloud/30 mt-2">
          Dashboard
        </p>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {nav.map((item) => {
          if ("children" in item) {
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
                    {item.children.map((child) => {
                      const childActive =
                        child.href === "/dashboard/catalog"
                          ? pathname === "/dashboard/catalog" ||
                            (pathname.startsWith("/dashboard/catalog/") &&
                              !pathname.startsWith("/dashboard/catalog/bundles"))
                          : pathname.startsWith(child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "block rounded-lg px-3 py-2 text-small transition-colors",
                            childActive
                              ? "bg-citrus text-ink font-medium"
                              : "text-cloud/60 hover:text-cloud hover:bg-cloud/5"
                          )}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-small transition-colors",
                active
                  ? "bg-citrus text-ink font-medium"
                  : "text-cloud/60 hover:text-cloud hover:bg-cloud/5"
              )}
            >
              <item.icon className="size-4 shrink-0" aria-hidden />
              {item.label}
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
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-small text-cloud/60 hover:text-cloud hover:bg-cloud/5 transition-colors"
          >
            <PenSquare className="size-4 shrink-0" aria-hidden />
            Website Content
            <span className="ml-auto font-mono text-[9px] uppercase tracking-widest text-cloud/30">
              Sanity
            </span>
          </a>
        </div>
      </nav>

      <div className="px-3 py-4 border-t border-cloud/10">
        <p className="px-3 text-small text-cloud/40 truncate mb-2">{email}</p>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-small text-cloud/60 hover:text-cloud hover:bg-cloud/5 transition-colors cursor-pointer"
        >
          <LogOut className="size-4 shrink-0" aria-hidden />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-50 h-14 bg-ink border-b border-cloud/10 flex items-center justify-between px-4">
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

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 top-14 z-40 bg-ink flex flex-col">{navContent}</div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 bg-ink border-r border-cloud/10 flex-col">
        {navContent}
      </aside>
    </>
  );
}
