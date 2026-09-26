"use client";

import { useEffect, useState } from "react";
import {
  Briefcase,
  ChartLine,
  Check,
  Copy,
  Flag,
  Globe,
  KeyRound,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  Server,
} from "lucide-react";
import { FacebookIcon, InstagramIcon, LinkedinIcon, TikTokIcon, YoutubeIcon } from "@/components/ui/SocialIcons";
import type { PlatformId, VaultSecret } from "@/lib/vault-platforms";
import type { Client, ClientProject } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

export type VaultClient = Pick<Client, "id" | "name" | "email" | "is_active">;
export type VaultProject = Pick<ClientProject, "id" | "client_id" | "name" | "sort_order">;

/** A decrypted vault entry, held only in memory while the vault is open. */
export type Item = {
  id: string;
  client_id: string | null;
  project_id: string | null;
  secret: VaultSecret;
  /** Couldn't be decrypted — shown, but never opened for editing, so a save
   *  can't overwrite the real (unreadable) data with a blank form. */
  broken: boolean;
};

/** A saved (or being-added) Gmail another account can sign in with. */
export type GmailOption = {
  id: string;
  email: string;
  master: boolean;
  /** Where it's filed — "Toni and Guy", "Client level"… */
  where: string;
};

/** Calls onClose on Escape or a click outside `ref` (deferred a tick so the
 *  click that opened the popover doesn't immediately close it). */
export function useDismiss(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => document.addEventListener("mousedown", onDown));
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [ref, onClose]);
}

const CLEAR_CLIPBOARD_MS = 30_000;
let clearTimer: ReturnType<typeof setTimeout> | undefined;

/** Copies a value, then wipes the clipboard 30 s later so a password
 *  doesn't linger there to be pasted somewhere by accident. */
export async function copyValue(value: string) {
  await navigator.clipboard.writeText(value);
  clearTimeout(clearTimer);
  clearTimer = setTimeout(() => navigator.clipboard.writeText("").catch(() => {}), CLEAR_CLIPBOARD_MS);
}

export const iconButton =
  "inline-flex items-center justify-center size-9 shrink-0 rounded-lg text-ink-subtle hover:text-ink hover:bg-ink/5 transition-colors cursor-pointer";

// Action buttons sit INSIDE the input's right edge, so every field in a row
// keeps the same width whether it has 0, 1 or 3 actions. The input reserves
// right padding for however many buttons it holds.
const ACTION_PAD = ["", "pr-11", "pr-[4.75rem]", "pr-[6.75rem]"];
export const actionPad = (count: number) => ACTION_PAD[Math.min(count, 3)];

export function InputActions({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-y-0 right-1.5 flex items-center [&>*]:size-8">{children}</div>;
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      title={`Copy ${label.toLowerCase()} (clears from the clipboard after 30 seconds)`}
      aria-label={`Copy ${label.toLowerCase()}`}
      onClick={() =>
        copyValue(value)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {})
      }
      className={iconButton}
    >
      {copied ? <Check className="size-4 text-forest" aria-hidden /> : <Copy className="size-4" aria-hidden />}
    </button>
  );
}

const ICONS: Record<PlatformId, React.ComponentType<{ className?: string }>> = {
  facebook_profile: FacebookIcon,
  facebook_page: Flag,
  instagram: InstagramIcon,
  meta_business: Briefcase,
  google_account: Mail,
  google_ads: Megaphone,
  google_analytics: ChartLine,
  google_business: MapPin,
  tiktok: TikTokIcon,
  youtube: YoutubeIcon,
  linkedin: LinkedinIcon,
  whatsapp_business: MessageCircle,
  website_hosting: Server,
  domain: Globe,
  other: KeyRound,
};

export function PlatformIcon({ platform, className }: { platform: PlatformId; className?: string }) {
  const Icon = ICONS[platform] ?? KeyRound;
  return <Icon className={cn("size-4", className)} aria-hidden />;
}

/** Only http(s) links are ever made clickable — never javascript: etc. */
export function safeHref(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return null;
  return `https://${v}`;
}
