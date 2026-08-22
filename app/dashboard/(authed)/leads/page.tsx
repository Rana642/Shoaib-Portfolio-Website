import { db } from "@/lib/dashboard/db";
import { formatDate } from "@/lib/dashboard/format";
import { PageHeader, Card, EmptyState } from "@/components/dashboard/ui";

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
        description="Audit requests from the contact form, and newsletter subscribers."
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
          {contacts.map((contact) => (
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
              <div className="mt-4 pt-4 border-t border-ink/10 flex flex-wrap gap-4">
                <a
                  href={`mailto:${contact.email}`}
                  className="text-small hover:underline decoration-citrus decoration-2 underline-offset-4"
                >
                  {contact.email}
                </a>
              </div>
            </Card>
          ))}
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
                </tr>
              </thead>
              <tbody>
                {subscribers.map((sub) => (
                  <tr key={sub.id} className="border-b border-ink/5 last:border-0">
                    <td className="px-5 py-3.5 text-small">{sub.email}</td>
                    <td className="px-5 py-3.5 text-small text-ink-muted">
                      {formatDate(sub.created_at)}
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
