import { notFound } from "next/navigation";
import { db } from "@/lib/dashboard/db";
import { todayInKarachi } from "@/lib/dashboard/letters";
import LetterEditor from "@/components/dashboard/LetterEditor";
import type { Letter } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Letter" };

export default async function LetterPage({ params }: PageProps<"/dashboard/letterhead/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data } = await db.from("letters").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();

  return <LetterEditor letter={data as Letter} today={todayInKarachi()} />;
}
