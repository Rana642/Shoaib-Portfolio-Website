import { redirect } from "next/navigation";
import { db } from "@/lib/dashboard/db";
import { requirePortalUser } from "@/lib/portal/auth";
import { PageHeader } from "@/components/dashboard/ui";
import PortalPasswords from "@/components/portal/PortalPasswords";
import { getMyVaultKey } from "@/lib/portal/vault";

export const dynamic = "force-dynamic";
export const metadata = { title: "Passwords" };

/** Owners only, and only when I've switched vault sharing on for the client. */
export default async function PortalPasswordsPage() {
  const ctx = await requirePortalUser();
  if (ctx.role !== "owner") redirect("/portal");
  const { data } = await db.from("clients").select("vault_share").eq("id", ctx.clientId).maybeSingle();
  if (!data?.vault_share) redirect("/portal");
  const res = await getMyVaultKey();
  const initialKey = "key" in res ? (res.key ?? null) : null;
  return (
    <>
      <PageHeader title="Passwords" description="Logins for your business accounts, locked with your own PIN." />
      <PortalPasswords initialKey={initialKey} />
    </>
  );
}
