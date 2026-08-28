import Link from "next/link";
import { Mail } from "lucide-react";
import { LinkedinIcon, InstagramIcon, YoutubeIcon } from "@/components/ui/SocialIcons";
import NewsletterForm from "@/components/forms/NewsletterForm";
import HostingerPartnerBadge from "@/components/shared/HostingerPartnerBadge";

const explore = [
  { href: "/services", label: "Services" },
  { href: "/case-studies", label: "Case Studies" },
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
  { href: "/shoaib-nabi-noor", label: "Resume" },
];

const services = [
  { href: "/services", label: "Meta Ads" },
  { href: "/services", label: "Google Ads" },
  { href: "/services", label: "Tracking & Analytics" },
  { href: "/services", label: "Funnels & Web" },
];

export default function Footer() {
  return (
    <footer className="bg-ink text-cloud mt-auto">
      <div className="container-wide py-16 md:py-20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
        {/* Brand */}
        <div>
          <Link href="/" className="font-serif italic text-2xl">
            ads by shoaib<span className="text-citrus not-italic font-sans font-bold">.</span>
          </Link>
          <p className="text-small text-cloud/60 mt-4 max-w-xs">
            Independent performance marketing practice led by Shoaib Nabi Noor.
            Managed, not just monitored.
          </p>
          <div className="flex gap-3 mt-6">
            {[
              { Icon: LinkedinIcon, label: "LinkedIn", href: "#" },
              { Icon: InstagramIcon, label: "Instagram", href: "#" },
              { Icon: YoutubeIcon, label: "YouTube", href: "#" },
              { Icon: Mail, label: "Email", href: "mailto:hello@adsbyshoaib.com" },
            ].map(({ Icon, label, href }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                className="flex items-center justify-center size-11 rounded-lg border border-cloud/15 text-cloud/70 hover:text-ink hover:bg-citrus hover:border-citrus transition-all duration-300"
              >
                <Icon className="size-4" />
              </a>
            ))}
          </div>
          <div className="mt-8">
            <HostingerPartnerBadge width={150} />
            <p className="text-tag text-cloud/40 mt-2 max-w-[200px] leading-relaxed">
              Verified Hostinger Partner. Clients get {" "}
              <span className="text-cloud/70 font-medium">20% off</span> with code NAWAL20.
            </p>
          </div>
        </div>

        {/* Explore */}
        <div>
          <h3 className="font-mono uppercase text-tag tracking-widest text-cloud/40 mb-5">
            Explore
          </h3>
          <ul className="space-y-3">
            {explore.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="text-small text-cloud/70 hover:text-citrus transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Services */}
        <div>
          <h3 className="font-mono uppercase text-tag tracking-widest text-cloud/40 mb-5">
            Services
          </h3>
          <ul className="space-y-3">
            {services.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="text-small text-cloud/70 hover:text-citrus transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Newsletter */}
        <div>
          <h3 className="font-mono uppercase text-tag tracking-widest text-cloud/40 mb-5">
            Newsletter
          </h3>
          <p className="text-small text-cloud/60 mb-4">
            Field notes on what actually moves the needle in paid media. No fluff.
          </p>
          <NewsletterForm />
        </div>
      </div>

      <div className="border-t border-cloud/10">
        <div className="container-wide py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-small text-cloud/40">
          <p>
            © {new Date().getFullYear()} Ads by Shoaib (formerly Socially Snap). All rights
            reserved.
          </p>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-cloud/70 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-cloud/70 transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
