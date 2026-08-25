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
} from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

// Ordered to match the actual funnel: a lead comes in, gets a proposal,
// accepts, signs an agreement, onboards, then becomes a billed client.
const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/leads", label: "Leads", icon: Inbox },
  { href: "/dashboard/proposals", label: "Proposals", icon: Send },
  { href: "/dashboard/agreements", label: "Agreements", icon: FileSignature },
  { href: "/dashboard/onboarding", label: "Onboarding", icon: ClipboardList },
  { href: "/dashboard/clients", label: "Clients", icon: Users },
  { href: "/dashboard/catalog", label: "Services Catalog", icon: Package },
  { href: "/dashboard/quotations", label: "Quotations", icon: FileText },
  { href: "/dashboard/invoices", label: "Invoices", icon: Receipt },
  { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
];

export default function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

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
