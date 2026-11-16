import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { can, requirePortalUser } from "@/lib/portal/auth";
import { activeProject } from "@/lib/portal/active-project";
import { CONTACTS_PAGE_SIZE, listContacts, safeSearch, syncProjectContactsIfStale } from "@/lib/portal/contacts";
import { SOURCE_LABEL, type ContactSource } from "@/lib/portal/contacts-merge";
import { Card, PageHeader } from "@/components/dashboard/ui";
import { AddContactForm, DeleteContactButton, NoteEditor } from "@/components/portal/ContactsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contacts" };

const SOURCES: ContactSource[] = ["website_booking", "website_inquiry", "whatsapp", "manual"];
const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Karachi" }) : "—";

/** The contact book of the business chosen in the sidebar: website guests, WhatsApp chats and people added by hand, saved in one place. */
export default async function PortalContactsPage({ searchParams }: { searchParams: Promise<{ q?: string; source?: string; page?: string }> }) {
  const ctx = await requirePortalUser();
  if (!can(ctx, "contacts")) redirect("/portal");
  const { q, source, page } = await searchParams;
  const { active } = await activeProject(ctx);
  if (!active) {
    return (
      <>
        <PageHeader title="Contacts" />
        <Card variant="solid" className="p-6">
          <p className="text-small text-ink-muted">No business yet — I&apos;ll set this up for you.</p>
        </Card>
      </>
    );
  }

  // Bring the book up to date when the page is opened plainly (a search or a page change just reads it).
  let syncError = false;
  if (!q && !source && !page) {
    try {
      await syncProjectContactsIfStale(active.id);
    } catch {
      syncError = true;
    }
  }
  const { rows, total, page: pageNo } = await listContacts(active.id, { q, source, page: Number(page) || 1 });
  const pages = Math.max(1, Math.ceil(total / CONTACTS_PAGE_SIZE));

  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: safeSearch(q) || undefined, source, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/portal/contacts${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Contacts"
        description={`Everyone who has contacted ${active.name}, saved in one place: website bookings and inquiries, WhatsApp chats, and people you add yourself.`}
        action={
          <a
            href="/portal/contacts/export"
            className="inline-flex items-center gap-2 rounded-lg border border-ink/20 px-4 py-2.5 text-small font-medium hover:bg-ink/5"
          >
            <Download className="size-4" /> Download CSV
          </a>
        }
      />
      {syncError && <p className="text-small text-red-700 mb-4">The latest contacts couldn&apos;t be loaded just now. What is saved is shown below.</p>}

      <Card className="p-5 mb-6">
        <h2 className="text-body-lg font-medium mb-3">Add a contact</h2>
        <AddContactForm projectId={active.id} />
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2 mb-4 text-small">
          <form action="/portal/contacts" className="flex gap-2 mr-2">
            <input
              name="q"
              defaultValue={safeSearch(q)}
              placeholder="Search name, phone or e-mail"
              className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-small w-64"
            />
            {source && <input type="hidden" name="source" value={source} />}
            <button type="submit" className="rounded-lg border border-ink/15 px-3 py-2 hover:bg-ink/5">
              Search
            </button>
          </form>
          <Link href={link({ source: undefined, page: undefined })} className={`rounded-lg border px-3 py-1.5 ${!source ? "border-ink bg-ink text-cloud" : "border-ink/15 hover:bg-ink/5"}`}>
            All
          </Link>
          {SOURCES.map((s) => (
            <Link
              key={s}
              href={link({ source: s, page: undefined })}
              className={`rounded-lg border px-3 py-1.5 ${source === s ? "border-ink bg-ink text-cloud" : "border-ink/15 hover:bg-ink/5"}`}
            >
              {SOURCE_LABEL[s]}
            </Link>
          ))}
          <span className="ml-auto text-ink-subtle">{total.toLocaleString("en-US")} contacts</span>
        </div>

        {rows.length === 0 ? (
          <p className="text-small text-ink-muted">{q || source ? "No contacts match." : "No contacts yet. They appear here as guests book, send an inquiry or write on WhatsApp."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-small">
              <thead>
                <tr className="text-left text-tag text-ink-subtle border-b border-ink/10">
                  <th className="py-2 pr-3 font-normal">Name</th>
                  <th className="py-2 pr-3 font-normal">Phone</th>
                  <th className="py-2 pr-3 font-normal">E-mail</th>
                  <th className="py-2 pr-3 font-normal">Where from</th>
                  <th className="py-2 pr-3 font-normal text-right">Bookings</th>
                  <th className="py-2 pr-3 font-normal text-right">Inquiries</th>
                  <th className="py-2 pr-3 font-normal">Last activity</th>
                  <th className="py-2 pr-3 font-normal">Note</th>
                  <th className="py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-ink/5 align-top">
                    <td className="py-2 pr-3 font-medium">{c.name ?? <span className="text-ink-subtle font-normal">No name</span>}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {c.phone ? (
                        c.sources.includes("whatsapp") && can(ctx, "whatsapp") ? (
                          <Link href={`/portal/whatsapp?q=${encodeURIComponent(c.contact_key.replace(/\D/g, "") || (c.phone ?? ""))}`} className="underline underline-offset-4" title="Open the WhatsApp chat">
                            {c.phone}
                          </Link>
                        ) : (
                          c.phone
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-3 break-all">{c.email ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {c.sources.map((s) => (
                          <span key={s} className="rounded-full border border-ink/15 px-2 py-0.5 text-tag whitespace-nowrap">
                            {SOURCE_LABEL[s] ?? s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{c.bookings || "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{c.inquiries || "—"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{date(c.last_activity_at)}</td>
                    <td className="py-2 pr-3">
                      <NoteEditor id={c.id} initial={c.notes ?? ""} />
                    </td>
                    <td className="py-2">{c.sources.length === 1 && c.sources[0] === "manual" ? <DeleteContactButton id={c.id} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <nav className="flex items-center justify-between mt-4 text-small">
            {pageNo > 1 ? (
              <Link href={link({ page: String(pageNo - 1) })} className="underline underline-offset-4">
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            <span className="text-ink-subtle">
              Page {pageNo} of {pages}
            </span>
            {pageNo < pages ? (
              <Link href={link({ page: String(pageNo + 1) })} className="underline underline-offset-4">
                Older →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </Card>
    </>
  );
}
