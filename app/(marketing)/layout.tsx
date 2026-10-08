import Nav from "@/components/layout/Nav";
import Analytics from "@/components/shared/Analytics";
import Footer from "@/components/layout/Footer";
import SmoothScroll from "@/components/shared/SmoothScroll";
import AmbientBackground from "@/components/shared/AmbientBackground";
import HostingerFloatingBadge from "@/components/shared/HostingerFloatingBadge";

/**
 * Marketing shell: nav, footer, smooth scroll, ambient background.
 * Lives here (not in the root layout) so /studio and /api stay unwrapped.
 */
export default function MarketingLayout({ children }: LayoutProps<"/">) {
  // GTM / GA4 / Meta Pixel load on the public site only — never in the
  // dashboard or client portal (faster pages, and no admin/client visits
  // counted as website traffic or ad conversions).
  return (
    <SmoothScroll>
      <Analytics />
      <AmbientBackground />
      <Nav />
      {children}
      <Footer />
      <HostingerFloatingBadge />
    </SmoothScroll>
  );
}
