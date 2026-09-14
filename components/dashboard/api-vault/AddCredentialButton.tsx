"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { buttonStyles } from "@/components/dashboard/ui";
import CredentialModal from "./CredentialModal";

export default function AddCredentialButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonStyles.primary}>
        <Plus className="size-4" aria-hidden />
        Add credential
      </button>
      {open && <CredentialModal onClose={() => setOpen(false)} />}
    </>
  );
}
