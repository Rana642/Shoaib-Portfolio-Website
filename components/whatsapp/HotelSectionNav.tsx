import Link from "next/link";

/** Bookings · Inquiries · Contacts tabs + the business switcher, shared by portal and dashboard. */
export default function HotelSectionNav({
  base,
  section,
  projects,
  projectId,
}: {
  /** "/portal/bookings" or "/dashboard/bookings" */
  base: string;
  section: "bookings" | "inquiries" | "contacts";
  projects: { id: string; name: string }[];
  projectId: string;
}) {
  const href = (s: string, p = projectId) => `${base}${s === "bookings" ? "" : `/${s}`}?project=${p}`;
  return (
    <div className="space-y-3 mb-5">
      <nav className="flex gap-1 border-b border-ink/10 text-small">
        {(["bookings", "inquiries", "contacts"] as const).map((s) => (
          <Link
            key={s}
            href={href(s)}
            className={`px-3 py-2 -mb-px border-b-2 capitalize ${section === s ? "border-ink font-medium" : "border-transparent text-ink-muted hover:text-ink"}`}
          >
            {s}
          </Link>
        ))}
      </nav>
      {projects.length > 1 && (
        <nav className="flex flex-wrap gap-2 text-small">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={href(section, p.id)}
              className={`rounded-lg border px-3 py-1.5 ${p.id === projectId ? "border-ink bg-ink text-cloud" : "border-ink/15 hover:bg-ink/5"}`}
            >
              {p.name}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
