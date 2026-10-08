"use client";

import { useRouter } from "next/navigation";

/** Hotel switcher as a compact dropdown, sitting in the list's toolbar. */
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
  const router = useRouter();
  if (projects.length < 2) return null;
  return (
    <select
      aria-label="Hotel"
      value={projectId}
      onChange={(e) => router.push(`${base}?project=${e.target.value}`)}
      className="rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-small font-medium cursor-pointer sm:max-w-[16rem]"
    >
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
