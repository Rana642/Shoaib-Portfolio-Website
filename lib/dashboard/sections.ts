import {
  BarChart3,
  SquarePlay,
  CircleDashed,
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
  LayoutGrid,
  MapPin,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  Package,
  Phone,
  PieChart,
  Plug,
  Receipt,
  ReceiptText,
  Repeat,
  ScrollText,
  Send,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Store,
  Briefcase,
  Building2,
  BedDouble,
  Users,
  Wallet,
  TrendingDown,
  TrendingUp,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * The dashboard's sections (GoHighLevel style). The main sidebar shows one
 * entry per section; inside a section its pages are tabs across the top of
 * the page (components/dashboard/SectionNav). A section's own setup lives
 * in its last group ("Setup"), pinned to the right of the tabs — so bank
 * accounts sit in Finance, WhatsApp numbers in WhatsApp, and so on (social
 * logins have their own Socially Snap → Settings → Integrations).
 * Page URLs are unchanged — a section just claims the paths that start
 * with one of its `match` prefixes; when two sections claim a path, the
 * longer (more specific) prefix wins (Planner's /social/planner over
 * Marketing's /social).
 */
export type SectionItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Not a tab: the page is reached from inside the section (the Planner's
   *  Posts / Stories toggle). Still in Ctrl+K search. */
  hidden?: boolean;
};
export type Section = {
  key: string;
  label: string;
  icon: LucideIcon;
  description: string;
  match: string[];
  /** `showTitle` prints the group's title as a small label before its tabs
   *  (Business Management: "Hotel Management", later "Salon Management"). */
  groups: { title: string; items: SectionItem[]; showTitle?: boolean }[];
  /** "bottom" = shown next to Sign out instead of in the main list (Settings). */
  placement?: "bottom";
  /** Key of an APP_GROUPS entry: the section sits in that group's sidebar dropdown
   *  instead of being a top-level entry. Add a new app = set this on its section. */
  app?: string;
};

/**
 * Sidebar dropdowns that hold several apps (Shoaib, 2026-10-30). "Socially Snap
 * Apps" is one heading; each app (Planner, Marketing, WhatsApp, …) is an entry
 * inside it, so a new app is one `app: "socially-snap"` line, and splitting the
 * product out later means moving every section that carries that key.
 */
export const APP_GROUPS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "socially-snap", label: "Socially Snap Apps", icon: LayoutGrid },
];

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
    description: "Your clients, their monthly reports and letters.",
    match: [`${D}/clients`, `${D}/reports`, `${D}/letterhead`],
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
        items: [{ href: `${D}/letterhead`, label: "Letterhead", icon: ScrollText }],
      },
      { title: "Setup", items: [{ href: `${D}/clients/setup`, label: "Setup", icon: SlidersHorizontal }] },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    icon: Wallet,
    description: "Money in and out, profit, invoices, and where clients send money.",
    match: [`${D}/invoices`, `${D}/quotations`, `${D}/receipts`, `${D}/retainers`, `${D}/finance`],
    groups: [
      { title: "Overview", items: [{ href: `${D}/finance`, label: "Overview", icon: LayoutDashboard, exact: true }] },
      {
        title: "Billing",
        items: [
          { href: `${D}/invoices`, label: "Invoices", icon: Receipt },
          { href: `${D}/quotations`, label: "Quotations", icon: FileText },
          { href: `${D}/receipts`, label: "Payment receipts", icon: ReceiptText },
          { href: `${D}/retainers`, label: "Retainers", icon: Repeat },
        ],
      },
      {
        title: "Books",
        items: [
          { href: `${D}/finance/income`, label: "Income", icon: TrendingUp },
          { href: `${D}/finance/expenses`, label: "Expenses", icon: TrendingDown },
          { href: `${D}/finance/reports`, label: "Reports", icon: PieChart },
        ],
      },
      { title: "Setup", items: [{ href: `${D}/finance/setup`, label: "Setup", icon: SlidersHorizontal }] },
    ],
  },
  {
    // Its own section (Shoaib, 2026-10-16), out of Marketing. Posts and
    // Stories are a toggle on the page's side, not tabs; Image / Reels &
    // Shorts / Videos are tabs inside the Posts calendar.
    key: "planner",
    app: "socially-snap",
    label: "Planner",
    icon: CalendarDays,
    description: "Posts, Reels & Shorts, Videos and Stories on one calendar.",
    match: [`${D}/social/planner`, `${D}/social/stories`],
    groups: [
      {
        title: "Planner",
        items: [
          { href: `${D}/social/planner`, label: "Planner", icon: CalendarDays },
          { href: `${D}/social/stories`, label: "Stories", icon: CircleDashed, hidden: true },
        ],
      },
    ],
  },
  {
    key: "marketing",
    app: "socially-snap",
    label: "Marketing",
    icon: Megaphone,
    description: "Insights, YouTube and Meta ads.",
    match: [`${D}/social/insights`, `${D}/ads`, `${D}/youtube`],
    groups: [
      {
        title: "Social",
        items: [
          { href: `${D}/social/insights`, label: "Insights", icon: BarChart3 },
          { href: `${D}/youtube`, label: "YouTube", icon: SquarePlay },
        ],
      },
      {
        title: "Ads",
        items: [{ href: `${D}/ads`, label: "Meta Ads", icon: Megaphone }],
      },
    ],
  },
  {
    // Its own app in the Socially Snap dropdown (Shoaib, 2026-10-30), out of
    // Marketing. One page, so no tabs.
    key: "gbp",
    app: "socially-snap",
    label: "Google Business",
    icon: MapPin,
    description: "Reviews, replies and posts for every connected Google Business Profile.",
    match: [`${D}/gbp`],
    groups: [{ title: "Google Business", items: [{ href: `${D}/gbp`, label: "Google Business", icon: MapPin }] }],
  },
  {
    key: "whatsapp",
    app: "socially-snap",
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
    // The Socially Snap apps' own settings, last in the dropdown (Shoaib,
    // 2026-10-31). Integrations (the old Marketing → Connections page, same
    // URL — every OAuth callback returns there) shows every login and
    // connected account with its health in one place. More tabs (alerts, …)
    // join this section later.
    key: "socially-settings",
    app: "socially-snap",
    label: "Settings",
    icon: SettingsIcon,
    description: "Integrations: every login and connected account, and whether it's working.",
    match: [`${D}/social`],
    groups: [{ title: "Settings", items: [{ href: `${D}/social`, label: "Integrations", icon: Plug, exact: true }] }],
  },
  {
    // One home for the industry systems we run for clients (Shoaib,
    // 2026-10-19). Each system is its own labelled group of tabs: Hotel
    // Management now — bookings, inquiries and guests from hotel websites and
    // WhatsApp — and Salon Management, Careers or others as they're built. It
    // belongs to Ads by Shoaib, NOT to the "Socially Snap Apps" dropdown
    // (Shoaib, 2026-10-30), so it stays a top-level entry. The client
    // portal keeps its own simpler "Bookings" section.
    key: "business",
    label: "Business Management",
    icon: Store,
    description: "The systems we run for client businesses — hotel bookings, inquiries and guests today.",
    match: [`${D}/bookings`, `${D}/inquiries`, `${D}/contacts`],
    groups: [
      {
        title: "Hotel Management",
        showTitle: true,
        items: [
          { href: `${D}/bookings`, label: "Bookings", icon: BedDouble },
          { href: `${D}/inquiries`, label: "Inquiries", icon: MessageSquareText },
          { href: `${D}/contacts`, label: "Contacts", icon: Contact },
        ],
      },
    ],
  },
  {
    // Shoaib's own tool, so its own sidebar item rather than a Clients tab
    // (2026-10-19). One page, so no tabs. The API Vault moved in from Settings
    // (2026-10-20): a tab inside the unlocked vault; its old URL redirects there.
    key: "vault",
    label: "Password Vault",
    icon: KeyRound,
    description: "Your zero-knowledge vault for client and personal logins, and the API Vault.",
    match: [`${D}/vault`, `${D}/api-vault`],
    groups: [
      {
        title: "Password Vault",
        items: [
          { href: `${D}/vault`, label: "Password Vault", icon: KeyRound },
          { href: `${D}/api-vault`, label: "API Vault", icon: Plug, hidden: true },
        ],
      },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    icon: SettingsIcon,
    description: "Your business profile.",
    match: [`${D}/settings`],
    placement: "bottom",
    groups: [
      {
        title: "Settings",
        items: [
          { href: `${D}/settings`, label: "Business profile", icon: Building2 },
        ],
      },
    ],
  },
];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** How specifically a list of prefixes claims a path: its longest matching prefix (0 = not at all). */
export const matchStrength = (match: string[], pathname: string) =>
  Math.max(0, ...match.filter((m) => under(pathname, m)).map((m) => m.length));

/** Is this path inside the section? A section with a more specific prefix for it wins. */
export const inSection = (section: Section, pathname: string, sections: Section[] = SECTIONS) => {
  const own = matchStrength(section.match, pathname);
  return own > 0 && !sections.some((s) => s !== section && matchStrength(s.match, pathname) > own);
};

/** The tabs a section shows (hidden pages are reached from inside it). */
export const visibleItems = (section: Section) => section.groups.flatMap((g) => g.items).filter((i) => !i.hidden);

/** The section a path belongs to (none for Overview / Home and unknown pages). A section
 *  with a single visible page gets no tabs of its own — it's just a link in the main sidebar. */
export function sectionFor(pathname: string, sections: Section[] = SECTIONS): Section | null {
  const owner = sections.find((s) => inSection(s, pathname, sections));
  return owner && visibleItems(owner).length > 1 ? owner : null;
}

/** Is this tab the current page? The most specific matching item wins (Bundle services over Single services). */
export function isItemActive(section: Section, item: SectionItem, pathname: string) {
  if (item.exact) return pathname === item.href;
  if (!under(pathname, item.href)) return false;
  return !section.groups
    .flatMap((g) => g.items)
    .some((o) => o.href !== item.href && o.href.length > item.href.length && under(pathname, o.href) && (!o.exact || pathname === o.href));
}
