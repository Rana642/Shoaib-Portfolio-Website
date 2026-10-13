import {
  CalendarClock,
  FilePen,
  FileSignature,
  FileText,
  Receipt,
  Send,
  TrendingDown,
  TrendingUp,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

/** "Create something" shortcuts — the sidebar's + New menu and the top of Ctrl+K. */
export const QUICK_ACTIONS: { label: string; href: string; icon: LucideIcon; keywords?: string }[] = [
  { label: "New client", href: "/dashboard/clients/new", icon: UserPlus, keywords: "customer add" },
  { label: "New proposal", href: "/dashboard/proposals/new", icon: Send, keywords: "pitch offer" },
  { label: "New quotation", href: "/dashboard/quotations/new", icon: FileText, keywords: "quote estimate" },
  { label: "New invoice", href: "/dashboard/invoices/new", icon: Receipt, keywords: "bill charge" },
  { label: "New agreement", href: "/dashboard/agreements/new", icon: FileSignature, keywords: "contract" },
  { label: "Add expense", href: "/dashboard/finance/expenses?new=expense", icon: TrendingDown, keywords: "cost spend kharcha" },
  { label: "Add income", href: "/dashboard/finance/income?new=income", icon: TrendingUp, keywords: "money received commission" },
  { label: "Add a monthly bill", href: "/dashboard/finance/expenses?new=bill", icon: CalendarClock, keywords: "subscription recurring" },
  { label: "New letter", href: "/dashboard/letterhead/new", icon: FilePen, keywords: "letterhead" },
];

/** Buttons anywhere can open Ctrl+K by dispatching this window event. */
export const OPEN_COMMAND_EVENT = "dashboard:open-command";
