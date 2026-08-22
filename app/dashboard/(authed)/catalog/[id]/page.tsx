import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { deleteCatalogItem } from "@/lib/dashboard/actions/catalog";
import { getSettings } from "@/lib/dashboard/settings";
import { PageHeader } from "@/components/dashboard/ui";
import CatalogForm from "@/components/dashboard/CatalogForm";
import DeleteButton from "@/components/dashboard/DeleteButton";
import type { CatalogItem } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";

export default async function EditCatalogItemPage({
  params,
}: PageProps<"/dashboard/catalog/[id]">) {
  const { id } = await params;
  const [{ data: item }, settings] = await Promise.all([
    db.from("catalog_items").select("*").eq("id", id).single(),
    getSettings(),
  ]);

  if (!item) notFound();

  async function handleDelete() {
    "use server";
    return deleteCatalogItem(id);
  }

  return (
    <>
      <Link
        href="/dashboard/catalog"
        className="group inline-flex items-center gap-2 text-small text-ink-subtle hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
        Catalog
      </Link>

      <PageHeader title={(item as CatalogItem).name} />

      <CatalogForm item={item as CatalogItem} defaultCurrency={settings.default_currency} />

      <div className="mt-10 pt-8 border-t border-ink/10 max-w-2xl">
        <p className="text-small text-ink-muted mb-3">
          Deleting this won&apos;t change documents that already use it — they keep their own copy
          of the description and rate.
        </p>
        <DeleteButton action={handleDelete} label="Delete item" />
      </div>
    </>
  );
}
