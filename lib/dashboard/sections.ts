import {
  BarChart3,
  Calculator,
  CalendarDays,
  ClipboardList,
  Contact,
  FileBarChart,
  FileSignature,
  FileText,
  FolderInput,
  Globe,
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
  ReceiptText,
  Repeat,
  ScrollText,
  Send,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Briefcase,
  Building2,
  BedDouble,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * The dashboard's sections (GoHighLevel style). The main sidebar shows one
 * entry per section; inside a section its pages are tabs across the top of
 * the page (components/dashboard/SectionNav). A section's own setup lives
 * in its last group ("Setup"), pinned to the right of the tabs — so bank
 * accounts sit in Finance, social connections in Marketing, and so on.
 * Page URLs are unchanged — a section just claims the paths that start
 * with one of its `match` prefixes.
 */
export type SectionItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };
export type Section = {
  key: string;
  label: string;
  icon: LucideIcon;
  description: string;
  match: string[];
  groups: { title: string; items: SectionItem[] }[];
  /** "bottom" = shown next to Sign out instead of in the main list (Settings). */
  placement?: "bottom";
};

const D = "/dashboard";
const W = `${D}/whatsapp`;

export const SECTIONS: Section[] = [
  {
    key: "sales",
    label: "Sales",
    icon: Briefcase,
    description: "From a new lead to an onboarded client, and the services you sell.",
    match: [`${D}/leads`, `${D}/proposals`, `${D}/agreements`, `${D}/onboarding`, `${D}/intakes`, `${D}/catalog`],
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
      {
        title: "Services",
        items: [
          { href: `${D}/catalog`, label: "Single services", icon: Package },
          { href: `${D}/catalog/bundles`, label: "Bundle services", icon: Package },
        ],
      },
    ],
  },
  {
    key: "clients",
    label: "Clients",
    icon: Users,
    description: "Your clients, their monthly reports, logins and letters.",
    match: [`${D}/clients`, `${D}/reports`, `${D}/vault`, `${D}/letterhead`],
    groups: [
      {
        title: "Clients",
        items: [
          { href: `${D}/clients`, label: "Clients", icon: Users },
          { href: `${D}/reports`, label: "Monthly reports", icon: FileBarChart },
        ],
      },
      {
        title: "Tools",
        items: [
          { href: `${D}/vault`, label: "Password Vault", icon: KeyRound },
          { href: `${D}/letterhead`, label: "Letterhead", icon: ScrollText },
        ],
      },
      { title: "Setup", items: [{ href: `${D}/clients/setup`, label: "Setup", icon: SlidersHorizontal }] },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    icon: Wallet,
    description: "Quotations, invoices, payments, and where clients send money.",
    match: [`${D}/invoices`, `${D}/quotations`, `${D}/receipts`, `${D}/retainers`, `${D}/finance`],
    groups: [
      {
        title: "Billing",
        items: [
          { href: `${D}/invoices`, label: "Invoices", icon: Receipt },
          { href: `${D}/quotations`, label: "Quotations", icon: FileText },
          { href: `${D}/receipts`, label: "Payment receipts", icon: ReceiptText },
          { href: `${D}/retainers`, label: "Retainers", icon: Repeat },
        ],
      },
      { title: "Setup", items: [{ href: `${D}/finance/setup`, label: "Setup", icon: SlidersHorizontal }] },
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
    // Data that comes in from client websites. Grouped by kind of data, not
    // by industry, so salon bookings or career-page applications become one
    // more tab here (and in the portal) instead of one more section.
    key: "websites",
    label: "Websites",
    icon: Globe,
    description: "Bookings, inquiries and contacts from client websites.",
    match: [`${D}/bookings`, `${D}/inquiries`, `${D}/contacts`],
    groups: [
      {
        title: "Websites",
        items: [
          { href: `${D}/bookings`, label: "Bookings", icon: BedDouble },
          { href: `${D}/inquiries`, label: "Inquiries", icon: MessageSquareText },
          { href: `${D}/contacts`, label: "Contacts", icon: Contact },
        ],
      },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    icon: SettingsIcon,
    description: "Your business profile and the API keys your integrations use.",
    match: [`${D}/settings`, `${D}/api-vault`],
    placement: "bottom",
    groups: [
      {
        title: "Settings",
        items: [
          { href: `${D}/settings`, label: "Business profile", icon: Building2 },
          { href: `${D}/api-vault`, label: "API Vault", icon: Plug },
        ],
      },
    ],
  },
];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** Is this path inside the section? */
export const inSection = (section: Section, pathname: string) => section.match.some((m) => under(pathname, m));

/** The section a path belongs to (none for Overview / Home and unknown pages). A section
 *  with a single page gets no tabs of its own — it's just a link in the main sidebar. */
export function sectionFor(pathname: string, sections: Section[] = SECTIONS): Section | null {
  return sections.find((s) => s.groups.flatMap((g) => g.items).length > 1 && inSection(s, pathname)) ?? null;
}

/** Is this tab the current page? The most specific matching item wins (Bundle services over Single services). */
export function isItemActive(section: Section, item: SectionItem, pathname: string) {
  if (item.exact) return pathname === item.href;
  if (!under(pathname, item.href)) return false;
  return !section.groups
    .flatMap((g) => g.items)
    .some((o) => o.href !== item.href && o.href.length > item.href.length && under(pathname, o.href) && (!o.exact || pathname === o.href));
}
