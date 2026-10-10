import { BedDouble, CalendarDays, Contact, FileText, Inbox, KeyRound, MessageCircle, UserCircle, Users } from "lucide-react";
import type { Section, SectionItem } from "@/lib/dashboard/sections";

/**
 * The client portal's sections — same Meta Business Suite pattern as the
 * dashboard (lib/dashboard/sections.ts). Each person only gets the pages
 * their features allow; empty sections disappear, and a section left with
 * one page is just a link (no menu of its own).
 */
export type PortalLink = "whatsapp" | "bookings" | "inquiries" | "contacts" | "passwords" | "planner" | "intakes" | "team";

const P = "/portal";
const ITEM: Record<PortalLink, SectionItem> = {
  whatsapp: { href: `${P}/whatsapp`, label: "WhatsApp", icon: MessageCircle },
  bookings: { href: `${P}/bookings`, label: "Bookings", icon: BedDouble },
  inquiries: { href: `${P}/inquiries`, label: "Inquiries", icon: Inbox },
  contacts: { href: `${P}/contacts`, label: "Contacts", icon: Contact },
  planner: { href: `${P}/planner`, label: "Planner", icon: CalendarDays },
  passwords: { href: `${P}/passwords`, label: "Passwords", icon: KeyRound },
  intakes: { href: `${P}/intakes`, label: "Intake forms", icon: FileText },
  team: { href: `${P}/team`, label: "Team", icon: Users },
};

const LAYOUT: { key: string; label: string; icon: Section["icon"]; description: string; links: PortalLink[] }[] = [
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, description: "Your WhatsApp chats.", links: ["whatsapp"] },
  {
    key: "bookings",
    label: "Bookings",
    icon: BedDouble,
    description: "Bookings, inquiries and guests from your website.",
    links: ["bookings", "inquiries", "contacts"],
  },
  { key: "planner", label: "Planner", icon: CalendarDays, description: "Your social media calendar.", links: ["planner"] },
  {
    key: "account",
    label: "Account",
    icon: UserCircle,
    description: "Passwords, forms and who can use this portal.",
    links: ["passwords", "intakes", "team"],
  },
];

export function portalSections(links: PortalLink[]): Section[] {
  return LAYOUT.map((l) => {
    const items = l.links.filter((k) => links.includes(k)).map((k) => ITEM[k]);
    return {
      key: `portal-${l.key}`,
      label: l.label,
      icon: l.icon,
      description: l.description,
      match: items.map((i) => i.href),
      groups: [{ title: l.label, items }],
    };
  }).filter((s) => s.groups[0].items.length > 0);
}
