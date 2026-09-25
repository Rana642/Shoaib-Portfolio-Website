import Link from "next/link";
import { Database, Plus } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { letterLabel } from "@/lib/dashboard/letters";
import { formatDate } from "@/lib/dashboard/format";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/dashboard/ui";
import type { Letter } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Letterhead" };

const th = "font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3";

export default async function LetterheadPage() {
  const { data, error } = await db
    .from("letters")
    .select("id, ref_no, title, body, letter_date, updated_at")
    .order("updated_at", { ascending: false });

  const letters = (data ?? []) as Pick<Letter, "id" | "ref_no" | "title" | "body" | "letter_date" | "updated_at">[];
  const needsSetup = error?.code === "PGRST205";

  const newLetter = (
    <LinkButton href="/dashboard/letterhead/new">
      <Plus className="size-4" aria-hidden />
      New letter
    </LinkButton>
  );

  return (
    <>
      <PageHeader
        title="Letterhead"
        description="Letters on your A4 letterhead — they save as you type, ready to print any time."
        action={newLetter}
      />

      {needsSetup ? (
        <Card className="p-6 flex gap-4">
          <Database className="size-5 shrink-0 text-ink-muted mt-0.5" aria-hidden />
          <div>
            <p className="font-medium">One-time setup: saving letters needs its database table</p>
            <p className="text-small text-ink-muted mt-1.5 max-w-xl">
              Run the “Letters” section of <code className="font-mono">supabase/dashboard-schema.sql</code> in the
              Supabase SQL Editor. Until then you can still write and print — letters just won&apos;t save.
            </p>
          </div>
        </Card>
      ) : error ? (
        <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">
          Couldn&apos;t load your letters: {error.message}
        </p>
      ) : letters.length === 0 ? (
        <EmptyState
          title="No letters yet"
          description="Write one on the letterhead and it's saved for next time. Need a blank page to write on by hand? Open a new letter and print it straight away."
          action={newLetter}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-ink/10">
                  <th className={th}>Ref</th>
                  <th className={th}>Letter</th>
                  <th className={`${th} hidden md:table-cell`}>Date</th>
                  <th className={`${th} hidden sm:table-cell`}>Last edited</th>
                </tr>
              </thead>
              <tbody>
                {letters.map((letter) => (
                  <tr key={letter.id} className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.02]">
                    <td className="px-5 py-4 text-small text-ink-muted whitespace-nowrap">{letter.ref_no}</td>
                    <td className="px-5 py-4">
                      <Link
                        href={`/dashboard/letterhead/${letter.id}`}
                        className="font-medium hover:underline decoration-citrus decoration-2 underline-offset-4"
                      >
                        {letterLabel(letter)}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-small text-ink-muted hidden md:table-cell whitespace-nowrap">
                      {formatDate(letter.letter_date)}
                    </td>
                    <td className="px-5 py-4 text-small text-ink-muted hidden sm:table-cell whitespace-nowrap">
                      {formatDate(letter.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
