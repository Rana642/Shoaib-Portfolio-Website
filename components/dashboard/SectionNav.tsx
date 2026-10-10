"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { isItemActive, type Section } from "@/lib/dashboard/sections";

/**
 * A dashboard section's own menu (Meta Business Suite style), next to the
 * main sidebar's icon rail. Sections and their items live in
 * lib/dashboard/sections.ts. Collapses to icons; remembered per section.
 */
export default function SectionNav({ section }: { section: Section }) {
  const STORAGE_KEY = `section-nav-collapsed-${section.key}`;
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  // Restore the remembered state after mount (localStorage isn't available during render).
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* blocked storage — stay expanded */
    }
  }, [STORAGE_KEY]);
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(STORAGE_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  const GROUPS = section.groups;
  const active = (href: string) => {
    const item = GROUPS.flatMap((g) => g.items).find((i) => i.href === href);
    return item ? isItemActive(section, item, pathname) : false;
  };

  return (
    <>
      {/* Desktop: a column next to the rail — collapses to icons (remembered) */}
      <nav
        aria-label={section.label}
        className={cn(
          "hidden lg:flex flex-col shrink-0 sticky top-0 h-dvh overflow-y-auto border-r border-ink/10 bg-white/50 backdrop-blur-sm py-6 transition-[width] duration-200",
          collapsed ? "w-16 px-2" : "w-56 px-3"
        )}
      >
        {collapsed ? (
          <p className="flex justify-center mb-5" title={section.label}>
            <section.icon className="size-5 text-ink-muted" aria-hidden />
          </p>
        ) : (
          <>
            <p className="px-3 font-serif italic text-h3 leading-none">{section.label}</p>
            <p className="px-3 mt-1.5 mb-5 text-tag text-ink-subtle">{section.description}</p>
          </>
        )}
        {GROUPS.map((g) => (
          <div key={g.title} className="mb-4">
            {collapsed ? (
              <div className="mx-2 mb-2 border-t border-ink/10" aria-hidden />
            ) : (
              <p className="px-3 mb-1 text-tag text-ink-subtle">{g.title}</p>
            )}
            <ul className="grid gap-0.5">
              {g.items.map((i) => (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    title={collapsed ? i.label : undefined}
                    aria-label={collapsed ? i.label : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg py-2 text-small transition-colors",
                      collapsed ? "justify-center px-0" : "px-3",
                      active(i.href) ? "bg-ink text-cloud font-medium" : "text-ink hover:bg-ink/5"
                    )}
                  >
                    <i.icon className="size-4 shrink-0" aria-hidden />
                    {!collapsed && i.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <button
          type="button"
          onClick={toggle}
          className={cn("mt-auto flex items-center gap-2 rounded-lg py-2 text-small text-ink-subtle hover:bg-ink/5 hover:text-ink", collapsed ? "justify-center" : "px-3")}
          aria-label={collapsed ? `Expand ${section.label} menu` : `Collapse ${section.label} menu`}
          title={collapsed ? "Expand menu" : "Collapse menu"}
        >
          {collapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
          {!collapsed && "Collapse"}
        </button>
      </nav>

      {/* Mobile / tablet: one scrollable row of tabs */}
      <nav aria-label={section.label} className="lg:hidden flex gap-2 overflow-x-auto px-5 md:px-8 pt-4 pb-3 border-b border-ink/10">
        {GROUPS.flatMap((g) => g.items).map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-small",
              active(i.href) ? "border-ink bg-ink text-cloud" : "border-ink/15 hover:bg-ink/5"
            )}
          >
            <i.icon className="size-3.5" aria-hidden />
            {i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
