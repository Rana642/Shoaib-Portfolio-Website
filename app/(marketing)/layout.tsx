import Nav from "@/components/layout/Nav";
import Footer from "@/components/layout/Footer";
import SmoothScroll from "@/components/shared/SmoothScroll";
import AmbientBackground from "@/components/shared/AmbientBackground";
import HostingerFloatingBadge from "@/components/shared/HostingerFloatingBadge";

/**
 * Marketing shell: nav, footer, smooth scroll, ambient background.
 * Lives here (not in the root layout) so /studio and /api stay unwrapped.
 */
export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <SmoothScroll>
      <AmbientBackground />
      <Nav />
      {children}
      <Footer />
      <HostingerFloatingBadge />
    </SmoothScroll>
  );
}
