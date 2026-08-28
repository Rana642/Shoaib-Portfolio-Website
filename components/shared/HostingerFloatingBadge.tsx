"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { X, ArrowRight } from "lucide-react";
import { hostinger } from "@/lib/hostinger";

const STORAGE_KEY = "hostinger-badge-collapsed";

/**
 * A quiet, dismissible floating "Verified Hostinger Partner" widget for the
 * public site. Expanded, it surfaces the partner discount; collapsed, it's
 * just the badge tucked in the corner. The badge art is Hostinger's
 * official lockup, unmodified on its own clean background. Hidden on the
 * dedicated coupon page (where it would be redundant) and only mounts after
 * a short delay so it never competes with a page's first paint.
 */
export default function HostingerFloatingBadge() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage blocked — default to collapsed */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(saved === "1");
    const t = setTimeout(() => setMounted(true), 900);
    return () => clearTimeout(t);
  }, []);

  const setCollapsedPersisted = (next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  if (pathname?.startsWith("/hostinger-coupon")) return null;

  return (
    <div
      className={`fixed bottom-4 right-4 z-40 print:hidden transition-all duration-500 ${
        mounted ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0 pointer-events-none"
      }`}
    >
      {collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsedPersisted(false)}
          aria-label="Show Hostinger partner discount"
          className="block rounded-2xl shadow-lg shadow-ink/20 ring-1 ring-black/5 transition-transform duration-300 hover:-translate-y-0.5"
        >
          <Image
            src={hostinger.badge.square}
            alt="Verified Hostinger Partner"
            width={56}
            height={56}
            className="rounded-2xl"
          />
        </button>
      ) : (
        <div className="w-72 max-w-[calc(100vw-2rem)] rounded-2xl bg-white shadow-2xl shadow-ink/20 ring-1 ring-black/5 overflow-hidden">
          <div className="flex items-start justify-between gap-2 px-4 pt-4">
            <Image
              src={hostinger.badge.horizontal}
              alt="Verified Hostinger Partner"
              width={132}
              height={50}
            />
            <button
              type="button"
              onClick={() => setCollapsedPersisted(true)}
              aria-label="Minimize"
              className="-mr-1 -mt-1 flex size-7 items-center justify-center rounded-lg text-ink-subtle hover:bg-ink/5 hover:text-ink transition-colors"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="px-4 pb-4 pt-3">
            <p className="text-body font-semibold leading-snug">
              Save {hostinger.discount} on Hostinger hosting
            </p>
            <p className="text-small text-ink-muted mt-1">
              Use my partner code{" "}
              <span className="font-mono font-semibold text-ink">{hostinger.coupon}</span> at
              checkout.
            </p>
            <Link
              href="/hostinger-coupon"
              className="group mt-3 inline-flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2.5 text-small font-medium text-cloud transition-colors hover:bg-ink/90"
            >
              Get the deal
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
