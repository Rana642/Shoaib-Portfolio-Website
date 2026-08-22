"use client";

import dynamic from "next/dynamic";
import config from "../../../sanity.config";
import { isSanityConfigured } from "../../../lib/sanity/env";

// Loaded client-only, no SSR: Sanity Studio is an authenticated SPA with no
// SSR value, and importing it into the RSC module graph trips a known
// Turbopack/`swr` export-condition conflict inside the `sanity` package.
const NextStudio = dynamic(() => import("next-sanity/studio").then((m) => m.NextStudio), {
  ssr: false,
});

export default function StudioPage() {
  if (!isSanityConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f14] text-[#fafafa] p-8">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold">Studio not configured yet</h1>
          <p className="mt-4 text-sm text-white/60">
            Create a free project at{" "}
            <a href="https://sanity.io" className="underline" target="_blank" rel="noopener noreferrer">
              sanity.io
            </a>
            , then set <code className="text-[#eab308]">NEXT_PUBLIC_SANITY_PROJECT_ID</code> in{" "}
            <code className="text-[#eab308]">.env.local</code> and restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  return <NextStudio config={config} />;
}
