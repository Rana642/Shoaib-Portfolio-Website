import { db } from "@/lib/dashboard/db";
import { getVaultMeta } from "@/lib/dashboard/actions/vault";
import { PageHeader } from "@/components/dashboard/ui";
import VaultApp from "@/components/dashboard/VaultApp";
import type { Client, ClientProject } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Password Vault" };

export default async function VaultPage() {
  const [meta, { data: clients }, { data: projects }] = await Promise.all([
    getVaultMeta(),
    // Inactive clients too, so their saved accounts still show a name; the
    // entry form only offers active ones.
    db.from("clients").select("id, name, email, is_active").order("name"),
    db.from("client_projects").select("id, client_id, name, sort_order").order("sort_order"),
  ]);

  return (
    <>
      <PageHeader
        title="Password Vault"
        description="Client and personal account logins, encrypted in your browser with your master password — the server only ever stores unreadable ciphertext."
      />
      <VaultApp
        meta={meta}
        clients={(clients ?? []) as Pick<Client, "id" | "name" | "email" | "is_active">[]}
        projects={(projects ?? []) as Pick<ClientProject, "id" | "client_id" | "name" | "sort_order">[]}
      />
    </>
  );
}
