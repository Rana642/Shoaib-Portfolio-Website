import { db } from "@/lib/dashboard/db";
import { getVaultMeta, listVaultEntries } from "@/lib/dashboard/actions/vault";
import { PageHeader } from "@/components/dashboard/ui";
import VaultApp from "@/components/dashboard/VaultApp";
import type { Client } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vault" };

export default async function VaultPage() {
  const [meta, entries, { data: clients }] = await Promise.all([
    getVaultMeta(),
    listVaultEntries(),
    db.from("clients").select("*").eq("is_active", true).order("name"),
  ]);

  return (
    <>
      <PageHeader
        title="Vault"
        description="Client credentials, encrypted in your browser with your master password — the server only ever stores unreadable ciphertext."
      />
      <VaultApp meta={meta} entries={entries} clients={(clients ?? []) as Client[]} />
    </>
  );
}
