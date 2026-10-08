import Link from "next/link";

/** The hotel switcher on Bookings / Inquiries / Contacts (portal and dashboard). */
export default function HotelSectionNav({
  base,
  projects,
  projectId,
}: {
  /** e.g. "/portal/inquiries" */
  base: string;
  projects: { id: string; name: string }[];
  projectId: string;
}) {
  if (projects.length < 2) return null;
  return (
    <nav className="flex flex-wrap gap-2 text-small mb-5">
      {projects.map((p) => (
        <Link
          key={p.id}
          href={`${base}?project=${p.id}`}
          className={`rounded-lg border px-3 py-1.5 ${p.id === projectId ? "border-ink bg-ink text-cloud" : "border-ink/15 hover:bg-ink/5"}`}
        >
          {p.name}
        </Link>
      ))}
    </nav>
  );
}
