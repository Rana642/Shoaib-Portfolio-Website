"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import { cn } from "@/lib/utils";

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
}: {
  email: string;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Reading persisted UI state from localStorage has to happen after mount
  // — doing it during render would diverge from the server's HTML and
  // cause a hydration mismatch. This is the sanctioned place to setState
  // from an effect; `hydrated` also gates the padding transition so it
  // doesn't animate on this first restore.
  useEffect(() => {
    let restored = false;
    try {
      restored = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      /* private mode / blocked storage — just default to expanded */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(restored);
    setHydrated(true);
  }, []);

  const toggle = () =>
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });

  return (
    <div className="relative min-h-screen bg-cloud">
      {/* Ambient colour wash — gives the frosted-glass panels something to
          actually frost over. Purely decorative, behind everything, and
          non-interactive. */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-40 -left-32 size-[32rem] rounded-full bg-citrus/25 blur-3xl ambient-blob" />
        <div className="absolute top-1/4 -right-28 size-[34rem] rounded-full bg-cobalt/20 blur-3xl ambient-blob-alt" />
        <div className="absolute -bottom-32 left-1/3 size-96 rounded-full bg-citrus/15 blur-3xl ambient-blob-slow" />
      </div>

      <Sidebar email={email} collapsed={collapsed} onToggle={toggle} />

      <main
        className={cn(
          // Literal-rem padding (not lg:pl-20 / lg:pl-64) to match the
          // sidebar's width — see the note there on why calc()-based
          // endpoints break the transition.
          "relative z-10 pt-14 lg:pt-0",
          hydrated && "transition-[padding] duration-300 ease-out",
          collapsed ? "lg:pl-[5rem]" : "lg:pl-[16rem]"
        )}
      >
        <div className="px-5 py-8 md:px-8 md:py-10 max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
