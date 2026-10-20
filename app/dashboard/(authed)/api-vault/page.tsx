import { redirect } from "next/navigation";

/** The API Vault now lives inside the Password Vault, behind the master
 *  password (2026-10-20). Old links and bookmarks land on its tab there. */
export default function ApiVaultPage() {
  redirect("/dashboard/vault?tab=api");
}
