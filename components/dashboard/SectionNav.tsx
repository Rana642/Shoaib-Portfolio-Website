"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isItemActive, type Section } from "@/lib/dashboard/sections";

/**
 * A dashboard section's pages as tabs across the top of the page
 * (GoHighLevel style) — one sidebar only, so the page keeps its full
 * width. Groups are split by a thin divider; the "Setup" group is pinned
 * to the right. Sections and their items live in lib/dashboard/sections.ts.
 */
export default function SectionNav({ section }: { section: Section }) {
  const pathname = usePathname();
  const groups = section.groups.filter((g) => g.title !== "Setup");
  const setup = section.groups.find((g) => g.title === "Setup");
  const rowRef = useRef<HTMLDivElement>(null);

  // On a phone the row scrolls sideways — bring the current tab into view
  // (horizontally only, so the page itself doesn't jump).
  useEffect(() => {
    const row = rowRef.current;
    const current = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !current || row.scrollWidth <= row.clientWidth) return;
    const r = row.getBoundingClientRect();
    const c = current.getBoundingClientRect();
    row.scrollTo({ left: row.scrollLeft + (c.left - r.left) - (r.width - c.width) / 2 });
  }, [pathname]);

  const tab = (i: Section["groups"][number]["items"][number]) => {
    const active = isItemActive(section, i, pathname);
    return (
      <Link
        key={i.href}
        href={i.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative h-full shrink-0 inline-flex items-center gap-2 px-1 text-small whitespace-nowrap transition-colors",
          active ? "text-ink font-medium" : "text-ink-muted hover:text-ink"
        )}
      >
        <i.icon className="size-4 shrink-0" aria-hidden />
        {i.label}
        {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-citrus" aria-hidden />}
      </Link>
    );
  };

  return (
    <nav
      aria-label={section.label}
      className="sticky top-14 lg:top-0 z-20 bg-cloud print:hidden"
    >
      {/* Exactly 3.25rem tall — DashboardShell's --section-nav-h relies on it. */}
      <div ref={rowRef} className="flex items-stretch gap-5 h-[3.25rem] border-b border-ink/10 overflow-x-auto px-5 md:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <p className="shrink-0 self-center flex items-center gap-2 pr-5 border-r border-ink/10 font-serif italic text-body-lg leading-none">
          <section.icon className="size-4 not-italic text-ink-muted" aria-hidden />
          {section.label}
        </p>
        {groups.map((g, gi) => (
          <div key={g.title} className="flex items-center gap-5">
            {gi > 0 && <span className="h-4 w-px bg-ink/10" aria-hidden />}
            {g.items.map(tab)}
          </div>
        ))}
        {setup && (
          <div className="ml-auto flex items-center gap-5">
            <span className="h-4 w-px bg-ink/10" aria-hidden />
            {setup.items.map(tab)}
          </div>
        )}
      </div>
    </nav>
  );
}
