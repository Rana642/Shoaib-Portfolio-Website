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
  const [{ data: item }, settings, { data: otherItemsData }, { data: membersData }] = await Promise.all([
    db.from("catalog_items").select("*").eq("id", id).single(),
    getSettings(),
    db.from("catalog_items").select("*").eq("is_bundle", false).neq("id", id).order("sort_order").order("name"),
    db.from("catalog_bundle_members").select("member_id").eq("bundle_id", id),
  ]);

  if (!item) notFound();

  const otherItems = (otherItemsData ?? []) as CatalogItem[];
  const memberIds = (membersData ?? []).map((row) => row.member_id as string);
  const listHref = (item as CatalogItem).is_bundle ? "/dashboard/catalog/bundles" : "/dashboard/catalog";

  async function handleDelete() {
    "use server";
    return deleteCatalogItem(id);
  }

  return (
    <>
      <Link
        href={listHref}
        className="group inline-flex items-center gap-2 text-small text-ink-subtle hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
        {(item as CatalogItem).is_bundle ? "Bundle Services" : "Single Services"}
      </Link>

      <PageHeader title={(item as CatalogItem).name} />

      <CatalogForm
        item={item as CatalogItem}
        otherItems={otherItems}
        memberIds={memberIds}
        defaultCurrency={settings.default_currency}
      />

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
