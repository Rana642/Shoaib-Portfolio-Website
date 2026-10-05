"use client";

import { Printer } from "lucide-react";
import { buttonStyles } from "@/components/dashboard/ui";

export default function PrintButton({ label = "Download PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonStyles.secondary}>
      <Printer className="size-4" aria-hidden /> {label}
    </button>
  );
}
