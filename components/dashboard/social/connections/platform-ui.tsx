import { Megaphone } from "lucide-react";
import { FacebookIcon, InstagramIcon, LinkedinIcon, TikTokIcon } from "@/components/ui/SocialIcons";
import { cn } from "@/lib/utils";
import type { ConnectionStatus, PlatformDef, PlatformKey } from "@/lib/social-platforms";

const ICONS: Record<PlatformKey, React.ComponentType<{ className?: string }>> = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  linkedin: LinkedinIcon,
  tiktok: TikTokIcon,
  meta_ads: Megaphone,
};

export function PlatformChip({ platform, size = "md" }: { platform: PlatformDef; size?: "sm" | "md" }) {
  const Icon = ICONS[platform.key];
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-xl shrink-0 shadow-sm",
        size === "md" ? "size-11" : "size-7 rounded-lg",
        platform.chipClass
      )}
    >
      <Icon className={size === "md" ? "size-5" : "size-3.5"} aria-hidden />
    </span>
  );
}

const PILL: Record<ConnectionStatus, { label: string; className: string; dot: string }> = {
  connected: { label: "Connected", className: "bg-forest/10 text-ink border-forest/30", dot: "bg-forest" },
  not_connected: { label: "Not connected", className: "bg-ink/5 text-ink-muted border-ink/10", dot: "bg-ink/30" },
  pending: { label: "Awaiting approval", className: "bg-citrus/20 text-ink border-citrus/50", dot: "bg-citrus" },
  workspace: { label: "Workspace", className: "bg-cobalt/10 text-ink border-cobalt/25", dot: "bg-cobalt" },
};

export function StatusPill({ status, label }: { status: ConnectionStatus; label?: string }) {
  const s = PILL[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-tag font-medium whitespace-nowrap", s.className)}>
      <span className={cn("size-1.5 rounded-full", s.dot)} aria-hidden />
      {label ?? s.label}
    </span>
  );
}
