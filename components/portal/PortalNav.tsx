"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export default function PortalNav({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="max-w-4xl mx-auto px-5 flex gap-1 overflow-x-auto" aria-label="Portal">
      {links.map((l) => {
        const active = l.href === "/portal" ? pathname === "/portal" || pathname === "/portal/send" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "px-3 py-2.5 text-small border-b-2 -mb-px whitespace-nowrap transition-colors",
              active ? "border-citrus text-ink font-medium" : "border-transparent text-ink-muted hover:text-ink"
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
