"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The inbox's resizable frame: drag the edge of the chat list or of the
 * Contact Profile to make room (e.g. for a phone mirror while recording).
 * Widths are CSS variables the inbox grid reads (--list-w, --profile-w),
 * remembered per browser. Drag the profile edge far right to hide it;
 * double-click a handle to reset.
 */
const KEY = "whatsapp-inbox-widths";
const LIST = { min: 220, max: 520, def: 320 };
const PROFILE = { min: 240, max: 460, def: 300 };

export default function InboxFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [list, setList] = useState(LIST.def);
  const [profile, setProfile] = useState(PROFILE.def);
  const [drag, setDrag] = useState<"list" | "profile" | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as { list?: number; profile?: number } | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved?.list) setList(saved.list);
      if (typeof saved?.profile === "number") setProfile(saved.profile);
    } catch {
      /* blocked storage — defaults */
    }
  }, []);

  const save = useCallback((l: number, p: number) => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ list: l, profile: p }));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const box = ref.current?.getBoundingClientRect();
      if (!box) return;
      if (drag === "list") {
        setList(Math.round(Math.min(LIST.max, Math.max(LIST.min, e.clientX - box.left))));
      } else {
        const w = box.right - e.clientX;
        // Pull it narrower than the minimum and it folds away completely.
        setProfile(w < PROFILE.min - 60 ? 0 : Math.round(Math.min(PROFILE.max, Math.max(PROFILE.min, w))));
      }
    };
    const up = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [drag]);

  // Persist when a drag ends.
  useEffect(() => {
    if (!drag) save(list, profile);
  }, [drag, list, profile, save]);

  const handle = (which: "list" | "profile", style: React.CSSProperties, extra: string) => (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={which === "list" ? "Resize chat list" : "Resize contact profile"}
      title="Drag to resize · double-click to reset"
      onPointerDown={(e) => {
        e.preventDefault();
        setDrag(which);
      }}
      onDoubleClick={() => {
        if (which === "list") setList(LIST.def);
        else setProfile(PROFILE.def);
      }}
      className={`absolute top-[6.25rem] bottom-0 z-20 w-2 -ml-1 cursor-col-resize group ${extra}`}
      style={style}
    >
      <span className={`block h-full w-px mx-auto transition-colors ${drag === which ? "bg-cobalt" : "bg-transparent group-hover:bg-cobalt/60"}`} />
    </div>
  );

  return (
    <div
      ref={ref}
      className={`relative ${className ?? ""}`}
      style={{ "--list-w": `${list}px`, "--profile-w": `${profile}px` } as React.CSSProperties}
    >
      {children}
      {handle("list", { left: list }, "hidden md:block")}
      {handle("profile", { right: profile, marginLeft: 0, marginRight: "-4px" }, "hidden xl:block")}
      {profile === 0 && (
        <button
          type="button"
          onClick={() => setProfile(PROFILE.def)}
          className="hidden xl:block absolute right-3 top-[3.85rem] z-20 rounded-md border border-cloud/30 px-2 py-0.5 text-tag text-cloud hover:bg-cloud/10"
        >
          Show profile
        </button>
      )}
    </div>
  );
}
