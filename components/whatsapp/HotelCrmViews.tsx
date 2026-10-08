import { Card } from "@/components/dashboard/ui";
import { INQUIRY_STATUSES, convertUrl, listHotelContacts, listHotelInquiries } from "@/lib/hotel-crm";
import { ContactsList, InquiriesList } from "./HotelCrm";

type Result = { error?: string; ok?: boolean } | undefined;

const notConnected = (
  <Card variant="solid" className="p-6">
    <p className="text-small text-ink-muted">This business&apos;s website isn&apos;t connected yet.</p>
  </Card>
);

export async function InquiriesView({
  projectId,
  onStatus,
}: {
  projectId: string;
  onStatus: (projectId: string, id: string, status: string) => Promise<Result>;
}) {
  const data = await listHotelInquiries(projectId);
  if (!data) return notConnected;
  if ("error" in data && data.error) return <p className="text-small text-red-700">Couldn&apos;t read inquiries: {data.error}</p>;
  const urls = Object.fromEntries(data.siteUrl ? data.rows.map((r) => [r.id, convertUrl(data.kind, data.siteUrl!, r)]) : []);
  return <InquiriesList rows={data.rows} statuses={INQUIRY_STATUSES[data.kind]} convertUrls={urls} onStatus={onStatus.bind(null, projectId)} />;
}

export async function ContactsView({ projectId, name }: { projectId: string; name: string }) {
  const rows = await listHotelContacts(projectId);
  if (!rows) return notConnected;
  return <ContactsList rows={rows} fileName={`${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-contacts`} />;
}
