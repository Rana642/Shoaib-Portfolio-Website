import Link from "next/link";
import { Send } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { formatDate } from "@/lib/dashboard/format";
import { PageHeader, Card, EmptyState, buttonStyles } from "@/components/dashboard/ui";
import DeleteButton from "@/components/dashboard/DeleteButton";
import { deleteContact, deleteSubscriber } from "@/lib/dashboard/actions/leads";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leads" };

type Contact = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  business: string;
  budget: string;
  message: string;
};

type Subscriber = { id: string; created_at: string; email: string };

export default async function LeadsPage() {
  const [{ data: contactsData }, { data: subscribersData }] = await Promise.all([
    db.from("contacts").select("*").order("created_at", { ascending: false }),
    db.from("subscribers").select("*").order("created_at", { ascending: false }),
  ]);

  const contacts = (contactsData ?? []) as Contact[];
  const subscribers = (subscribersData ?? []) as Subscriber[];

  return (
    <>
      <PageHeader
        title="Leads"
        description="Everything the website captures on its own: audit requests from the contact form, and footer newsletter signups. Start a proposal straight from a request, or delete one you're done with."
      />

      <h2 className="text-body-lg font-semibold mb-4">
        Audit requests{" "}
        <span className="text-ink-subtle font-normal">({contacts.length})</span>
      </h2>

      {contacts.length === 0 ? (
        <EmptyState
          title="No audit requests yet"
          description="Submissions from the contact form on adsbyshoaib.com land here."
        />
      ) : (
        <div className="space-y-4">
          {contacts.map((contact) => {
            async function handleDelete() {
              "use server";
              return deleteContact(contact.id);
            }
            return (
              <Card key={contact.id} className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{contact.name}</p>
                    <p className="text-small text-cobalt mt-0.5">{contact.business}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
                      {formatDate(contact.created_at)}
                    </p>
                    <p className="text-small text-ink-muted mt-1">{contact.budget}</p>
                  </div>
                </div>
                <p className="text-body text-ink-muted mt-4">{contact.message}</p>
                <div className="mt-4 pt-4 border-t border-ink/10 flex flex-wrap items-center justify-between gap-4">
                  <a
                    href={`mailto:${contact.email}`}
                    className="text-small hover:underline decoration-citrus decoration-2 underline-offset-4"
                  >
                    {contact.email}
                  </a>
                  <div className="flex flex-wrap items-center gap-3">
                    <DeleteButton
                      action={handleDelete}
                      label="Delete"
                      confirmLabel="Click again to delete"
                    />
                    <Link
                      href={`/dashboard/proposals/new?${new URLSearchParams({
                        name: contact.name,
                        email: contact.email,
                        business: contact.business,
                      })}`}
                      className={buttonStyles.secondary}
                    >
                      <Send className="size-4" aria-hidden />
                      New proposal
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <h2 className="text-body-lg font-semibold mb-4 mt-12">
        Newsletter subscribers{" "}
        <span className="text-ink-subtle font-normal">({subscribers.length})</span>
      </h2>

      {subscribers.length === 0 ? (
        <EmptyState
          title="No subscribers yet"
          description="Signups from the footer newsletter form land here."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-ink/10">
                  <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3">
                    Email
                  </th>
                  <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3">
                    Subscribed
                  </th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {subscribers.map((sub) => {
                  async function handleDelete() {
                    "use server";
                    return deleteSubscriber(sub.id);
                  }
                  return (
                    <tr key={sub.id} className="border-b border-ink/5 last:border-0">
                      <td className="px-5 py-3.5 text-small">{sub.email}</td>
                      <td className="px-5 py-3.5 text-small text-ink-muted">
                        {formatDate(sub.created_at)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <DeleteButton
                          action={handleDelete}
                          label="Remove"
                          confirmLabel="Click again to remove"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
