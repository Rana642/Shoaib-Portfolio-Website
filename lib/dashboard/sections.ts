import {
  BarChart3,
  BedDouble,
  Calculator,
  CalendarDays,
  ClipboardList,
  Contact,
  FileBarChart,
  FileSignature,
  FileText,
  FolderInput,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Link2,
  MapPin,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  Package,
  Phone,
  Plug,
  Receipt,
  Repeat,
  ScrollText,
  Send,
  Settings as SettingsIcon,
  Briefcase,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * The dashboard's sections (Meta Business Suite style). The main sidebar
 * shows one entry per section; inside a section the main sidebar drops to
 * its icon rail and the section's own menu (components/dashboard/SectionNav)
 * sits next to it. Page URLs are unchanged — a section just claims the
 * paths that start with one of its `match` prefixes.
 */
export type SectionItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };
export type Section = {
  key: string;
  label: string;
  icon: LucideIcon;
  description: string;
  match: string[];
  groups: { title: string; items: SectionItem[] }[];
};

const D = "/dashboard";
const W = `${D}/whatsapp`;

export const SECTIONS: Section[] = [
  {
    key: "sales",
    label: "Sales",
    icon: Briefcase,
    description: "From a new lead to an onboarded client.",
    match: [`${D}/leads`, `${D}/proposals`, `${D}/agreements`, `${D}/onboarding`, `${D}/intakes`],
    groups: [
      {
        title: "Pipeline",
        items: [
          { href: `${D}/leads`, label: "Leads", icon: Inbox },
          { href: `${D}/proposals`, label: "Proposals", icon: Send },
          { href: `${D}/agreements`, label: "Agreements", icon: FileSignature },
        ],
      },
      {
        title: "Onboarding",
        items: [
          { href: `${D}/onboarding`, label: "Onboarding", icon: ClipboardList },
          { href: `${D}/intakes`, label: "Intakes", icon: FolderInput },
        ],
      },
    ],
  },
  {
    key: "billing",
    label: "Clients & Billing",
    icon: Wallet,
    description: "Clients, services, quotes, invoices and monthly reports.",
    match: [`${D}/clients`, `${D}/catalog`, `${D}/quotations`, `${D}/invoices`, `${D}/retainers`, `${D}/reports`, `${D}/letterhead`],
    groups: [
      {
        title: "Clients",
        items: [
          { href: `${D}/clients`, label: "Clients", icon: Users },
          { href: `${D}/catalog`, label: "Single services", icon: Package },
          { href: `${D}/catalog/bundles`, label: "Bundle services", icon: Package },
        ],
      },
      {
        title: "Billing",
        items: [
          { href: `${D}/quotations`, label: "Quotations", icon: FileText },
          { href: `${D}/invoices`, label: "Invoices", icon: Receipt },
          { href: `${D}/retainers`, label: "Retainers", icon: Repeat },
          { href: `${D}/reports`, label: "Reports", icon: FileBarChart },
          { href: `${D}/letterhead`, label: "Letterhead", icon: ScrollText },
        ],
      },
    ],
  },
  {
    key: "marketing",
    label: "Marketing",
    icon: Megaphone,
    description: "Posts, insights, ads and Google Business.",
    match: [`${D}/social`, `${D}/ads`, `${D}/gbp`],
    groups: [
      {
        title: "Social",
        items: [
          { href: `${D}/social/planner`, label: "Planner", icon: CalendarDays },
          { href: `${D}/social/insights`, label: "Insights", icon: BarChart3 },
        ],
      },
      {
        title: "Ads & listings",
        items: [
          { href: `${D}/ads`, label: "Meta Ads", icon: Megaphone },
          { href: `${D}/gbp`, label: "Google Business", icon: MapPin },
        ],
      },
      { title: "Setup", items: [{ href: `${D}/social`, label: "Connections", icon: Link2, exact: true }] },
    ],
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    icon: MessageCircle,
    description: "Chats, broadcasts and templates for every connected number.",
    match: [W],
    groups: [
      {
        title: "Chats",
        items: [
          { href: `${W}/overview`, label: "Overview", icon: LayoutDashboard },
          { href: W, label: "Inbox", icon: Inbox, exact: true },
        ],
      },
      {
        title: "Messaging",
        items: [
          { href: `${W}/broadcasts`, label: "Broadcasts", icon: Megaphone },
          { href: `${W}/templates`, label: "Templates", icon: FileText },
          { href: `${W}/automation`, label: "Automation", icon: Zap },
        ],
      },
      {
        title: "Setup",
        items: [
          { href: `${W}/numbers`, label: "Numbers", icon: Phone },
          { href: `${W}/pricing`, label: "Pricing", icon: Calculator },
        ],
      },
    ],
  },
  {
    key: "hotels",
    label: "Hotels",
    icon: BedDouble,
    description: "Bookings, inquiries and guests from the hotel websites.",
    match: [`${D}/bookings`, `${D}/inquiries`, `${D}/contacts`],
    groups: [
      {
        title: "Hotels",
        items: [
          { href: `${D}/bookings`, label: "Bookings", icon: BedDouble },
          { href: `${D}/inquiries`, label: "Inquiries", icon: MessageSquareText },
          { href: `${D}/contacts`, label: "Guest contacts", icon: Contact },
        ],
      },
    ],
  },
  {
    key: "admin",
    label: "Admin",
    icon: SettingsIcon,
    description: "Passwords, API keys and business settings.",
    match: [`${D}/vault`, `${D}/api-vault`, `${D}/settings`],
    groups: [
      {
        title: "Admin",
        items: [
          { href: `${D}/vault`, label: "Password Vault", icon: KeyRound },
          { href: `${D}/api-vault`, label: "API Vault", icon: Plug },
          { href: `${D}/settings`, label: "Settings", icon: SettingsIcon },
        ],
      },
    ],
  },
];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** The section a path belongs to (none for Overview / Home and unknown pages). A section
 *  with a single page gets no menu of its own — it's just a link in the main sidebar. */
export function sectionFor(pathname: string, sections: Section[] = SECTIONS): Section | null {
  return (
    sections.find((s) => s.groups.flatMap((g) => g.items).length > 1 && s.match.some((m) => under(pathname, m))) ?? null
  );
}

/** Is this menu item the current page? The most specific matching item wins (Bundle services over Single services). */
export function isItemActive(section: Section, item: SectionItem, pathname: string) {
  if (item.exact) return pathname === item.href;
  if (!under(pathname, item.href)) return false;
  return !section.groups
    .flatMap((g) => g.items)
    .some((o) => o.href !== item.href && o.href.length > item.href.length && under(pathname, o.href) && (!o.exact || pathname === o.href));
}
