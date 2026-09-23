"use client";

import { useState, useTransition } from "react";
import { ArrowUpRight, Download, LoaderCircle, Trash2 } from "lucide-react";
import { removeAccount } from "@/lib/dashboard/actions/social";
import { buttonStyles } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";
import type { ConnectionStatus, PlatformDef } from "@/lib/social-platforms";
import { PlatformChip, StatusPill } from "./platform-ui";

export type TileAccount = { id: string; label: string; detail?: string };

export type TileAction =
  | { kind: "link"; label: string; href: string }
  | { kind: "button"; label: string; onClick: () => void; busy?: boolean }
  | { kind: "disabled"; label: string };

export default function PlatformTile({
  platform,
  status,
  accounts,
  note,
  action,
}: {
  platform: PlatformDef;
  status: ConnectionStatus;
  accounts: TileAccount[];
  note?: string;
  action: TileAction | null;
}) {
  return (
    <div
      className={cn(
        "group relative flex flex-col gap-4 rounded-2xl border bg-white/70 p-5 transition-all hover:shadow-lg hover:shadow-ink/5 hover:-translate-y-0.5",
        status === "connected" ? "border-forest/25" : "border-ink/10"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <PlatformChip platform={platform} />
          <div className="min-w-0">
            <p className="font-semibold leading-tight">{platform.label}</p>
            <p className="text-tag text-ink-subtle mt-0.5 truncate">{platform.tagline}</p>
          </div>
        </div>
        <StatusPill status={status} />
      </div>

      <div className="flex-1 min-h-12">
        {accounts.length > 0 ? (
          <ul className="space-y-1.5">
            {accounts.map((a) => (
              <AccountRow key={a.id} account={a} />
            ))}
          </ul>
        ) : (
          <p className="text-small text-ink-muted leading-relaxed">{note}</p>
        )}
        {accounts.length > 0 && note && <p className="text-tag text-ink-subtle mt-2">{note}</p>}
      </div>

      {action && <TileActionButton action={action} />}
    </div>
  );
}

function AccountRow({ account }: { account: TileAccount }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg bg-ink/[0.03] px-3 py-2">
      <span className="flex items-center gap-2 min-w-0">
        <span className="flex items-center justify-center size-6 rounded-full bg-white border border-ink/10 text-tag font-semibold shrink-0">
          {account.label.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block text-small font-medium truncate">{account.label}</span>
          {account.detail && <span className="block text-tag text-ink-subtle truncate">{account.detail}</span>}
        </span>
      </span>
      {confirming ? (
        <span className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => removeAccount(account.id))}
            className="rounded-md px-2 py-1 text-tag font-medium text-red-700 hover:bg-red-500/10"
          >
            {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : "Remove"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="rounded-md px-2 py-1 text-tag text-ink-muted hover:bg-ink/5">
            Keep
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Disconnect ${account.label}`}
          className="p-1 text-ink-subtle opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-700 transition-all"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      )}
    </li>
  );
}

function TileActionButton({ action }: { action: TileAction }) {
  const base = cn(buttonStyles.secondary, "w-full");
  if (action.kind === "link") {
    return (
      <a href={action.href} className={base}>
        {action.label}
        <ArrowUpRight className="size-4" aria-hidden />
      </a>
    );
  }
  if (action.kind === "button") {
    return (
      <button type="button" onClick={action.onClick} disabled={action.busy} className={base}>
        {action.busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
        {action.label}
      </button>
    );
  }
  return (
    <button type="button" disabled className={cn(base, "cursor-not-allowed")}>
      {action.label}
    </button>
  );
}
