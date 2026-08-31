import { db } from "@/lib/dashboard/db";
import { PageHeader } from "@/components/dashboard/ui";
import IntakeCreateForm from "@/components/dashboard/IntakeCreateForm";
import type { Client } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "New intake" };

export default async function NewIntakePage() {
  const { data: clients } = await db
    .from("clients")
    .select("*")
    .eq("is_active", true)
    .order("name");

  return (
    <>
      <PageHeader title="New intake" />
      <IntakeCreateForm clients={(clients ?? []) as Client[]} />
    </>
  );
}
