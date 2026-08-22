import type { Metadata } from "next";
import { Analytics as VercelAnalytics } from "@vercel/analytics/next";
import { instrumentSerif, geist, geistMono } from "./fonts";
import JsonLd from "@/components/shared/JsonLd";
import Analytics from "@/components/shared/Analytics";
import { organizationSchema } from "@/lib/schema";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://adsbyshoaib.com"),
  title: {
    default: "Ads by Shoaib — Performance Marketing by Shoaib Nabi Noor",
    template: "%s — Ads by Shoaib",
  },
  description:
    "Independent performance marketing practice led by Shoaib Nabi Noor — turning strategy, targeting, and creative into leads, bookings, and sales across Meta, Google, YouTube, and TikTok.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${geist.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col noise-overlay">
        <JsonLd data={organizationSchema()} />
        <Analytics />
        {children}
        <VercelAnalytics />
      </body>
    </html>
  );
}
