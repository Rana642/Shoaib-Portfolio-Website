"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Card, buttonStyles } from "@/components/dashboard/ui";
import type { EntryKind } from "@/lib/finance";
import EntryForm from "./EntryForm";

/** "Add expense" / "Add income": a button that opens the form in a card. */
export default function NewEntry({
  kind,
  clients,
  rates,
  variant = "primary",
  startOpen = false,
}: {
  kind: EntryKind;
  clients: { id: string; name: string }[];
  rates: Record<string, number>;
  variant?: "primary" | "secondary";
  startOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const label = kind === "expense" ? "Add expense" : "Add income";

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonStyles[variant]}>
        <Plus className="size-4" aria-hidden />
        {label}
      </button>
    );
  }
  return (
    <Card className="p-6 lg:p-8 w-full">
      <h2 className="text-body-lg font-semibold mb-5">{label}</h2>
      <EntryForm
        kind={kind}
        clients={clients}
        rates={rates}
        onDone={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </Card>
  );
}
