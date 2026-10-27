"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar, { type NavItem } from "@/components/dashboard/Sidebar";
import PwaRegister from "@/components/dashboard/PwaRegister";
import CommandPalette from "@/components/dashboard/CommandPalette";
import SectionNav from "@/components/dashboard/SectionNav";
import { sectionFor, type Section } from "@/lib/dashboard/sections";
import { cn } from "@/lib/utils";

// Pages fill the screen up to a generous cap (96rem) so a wide monitor isn't
// half empty; settings forms lay out in two columns (SettingsCard). The
// Planner's week columns, Insights charts and the inboxes use every pixel.
const WIDE_ROUTES = [
  "/dashboard/social/planner",
  "/dashboard/social/stories",
  "/dashboard/social/insights",
  "/portal/planner",
  "/portal/stories",
  "/dashboard/bookings",
  "/portal/bookings",
  "/dashboard/whatsapp",
  "/portal/whatsapp",
  "/dashboard/inquiries",
  "/portal/inquiries",
  "/dashboard/contacts",
  "/portal/contacts",
];

const STORAGE_KEY = "dashboard-sidebar-collapsed";

/**
 * Owns the desktop sidebar's collapsed state so both the sidebar and the
 * main content's left padding move together — the server layout can't
 * hold this client state itself. Persists the choice to localStorage so
 * it survives navigation and reloads. Mobile is unaffected (it uses the
 * sidebar's own drawer, never the collapsed rail).
 */
export default function DashboardShell({
  email,
  children,
  portal,
  banner,
}: {
  email: string;
  children: React.ReactNode;
  /** A notice above every page's content (e.g. HeldPostsBanner). */
  banner?: React.ReactNode;
  /** The client portal: same shell, its own sidebar items + sections, no PWA. */
  portal?: { nav: NavItem[]; sections?: Section[] };
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const pathname = usePathname();
  // Inside a section (lib/dashboard/sections.ts) its pages are tabs across
  // the top of the content — the sidebar keeps whatever width you chose.
  const section = portal ? (portal.sections ? sectionFor(pathname, portal.sections) : null) : sectionFor(pathname);
  const isWide = WIDE_ROUTES.some((route) => pathname.startsWith(route));
  const storageKey = portal ? `portal-${STORAGE_KEY}` : STORAGE_KEY;

  // Reading persisted UI state from localStorage has to happen after mount
  // — doing it during render would diverge from the server's HTML and
  // cause a hydration mismatch. This is the sanctioned place to setState
  // from an effect; `hydrated` also gates the padding transition so it
  // doesn't animate on this first restore.
  useEffect(() => {
    let restored = false;
    try {
      restored = localStorage.getItem(storageKey) === "1";
    } catch {
      /* private mode / blocked storage — just default to expanded */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(restored);
    setHydrated(true);
  }, [storageKey]);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div className="relative min-h-screen bg-cloud print:bg-white">
      {!portal && <PwaRegister />}
      {!portal && <CommandPalette />}
      {/* Ambient colour wash — gives the frosted-glass panels something to
          actually frost over. Purely decorative, behind everything, and
          non-interactive. */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden print:hidden" aria-hidden>
        <div className="absolute -top-40 -left-32 size-[32rem] rounded-full bg-citrus/25 blur-3xl ambient-blob" />
        <div className="absolute top-1/4 -right-28 size-[34rem] rounded-full bg-cobalt/20 blur-3xl ambient-blob-alt" />
        <div className="absolute -bottom-32 left-1/3 size-96 rounded-full bg-citrus/15 blur-3xl ambient-blob-slow" />
      </div>

      {portal ? (
        <Sidebar
          email={email}
          collapsed={collapsed}
          onToggle={toggle}
          nav={portal.nav}
          homeHref="/portal"
          areaLabel="Client portal"
          loginHref="/portal/login"
          showStudio={false}
        />
      ) : (
        <Sidebar email={email} collapsed={collapsed} onToggle={toggle} />
      )}

      <main
        className={cn(
          // Literal-rem padding (not lg:pl-20 / lg:pl-64) to match the
          // sidebar's width — see the note there on why calc()-based
          // endpoints break the transition.
          "relative z-10 pt-14 lg:pt-0",
          hydrated && "transition-[padding] duration-300 ease-out",
          collapsed ? "lg:pl-[5rem]" : "lg:pl-[16rem]"
        )}
        // Full-height pages (.app-height) subtract the section tab bar.
        style={{ "--section-nav-h": section ? "3.25rem" : "0px" } as React.CSSProperties}
      >
        {section && <SectionNav section={section} />}
        <div
          className={cn(
            "px-5 md:px-8 print:p-0 print:max-w-none",
            section ? "py-6 lg:py-8" : "py-8 md:py-10",
            isWide ? "max-w-none" : "max-w-[96rem]"
          )}
        >
          {banner}
          {children}
        </div>
      </main>
    </div>
  );
}
