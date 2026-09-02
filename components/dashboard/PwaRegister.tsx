"use client";

import { useEffect } from "react";

/**
 * Registers the dashboard's service worker so it can be installed to a phone
 * home screen and opened like a native app. Production only — dev uses HMR
 * and shouldn't have a SW lingering. The SW itself is pass-through (no
 * caching), so there's nothing to go stale. Renders nothing.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* SW registration is a progressive enhancement — ignore failures */
    });
  }, []);

  return null;
}
