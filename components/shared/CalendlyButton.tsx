"use client";

import Script from "next/script";

declare global {
  interface Window {
    Calendly?: { initPopupWidget: (options: { url: string }) => void };
  }
}

const calendlyUrl = process.env.NEXT_PUBLIC_CALENDLY_URL;

/** Renders nothing until Shoaib adds NEXT_PUBLIC_CALENDLY_URL. */
export default function CalendlyButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  if (!calendlyUrl) return null;

  return (
    <>
      <link rel="stylesheet" href="https://assets.calendly.com/assets/external/widget.css" />
      <Script src="https://assets.calendly.com/assets/external/widget.js" strategy="lazyOnload" />
      <button
        type="button"
        onClick={() => window.Calendly?.initPopupWidget({ url: calendlyUrl })}
        className={className}
      >
        {children}
      </button>
    </>
  );
}
