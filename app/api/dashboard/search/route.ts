import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/dashboard/auth";
import { db } from "@/lib/dashboard/db";

export type SearchHit = { type: string; label: string; sub: string | null; href: string };

/**
 * The Ctrl+K search: clients, leads, proposals, quotations, invoices,
 * agreements and services whose name / number / email contains the query.
 * A few of each, newest first.
 */
export async function GET(request: Request) {
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ hits: [] });
  // PostgREST `or` filters are comma-separated — strip anything that could break out of the pattern.
  const safe = q.replace(/[,()*%\\]/g, " ").trim();
  if (!safe) return NextResponse.json({ hits: [] });
  const like = `%${safe}%`;
  const N = 5;

  const [clients, leads, proposals, quotations, invoices, agreements, services] = await Promise.all([
    db.from("clients").select("id, name, contact_person, email").or(`name.ilike.${like},contact_person.ilike.${like},email.ilike.${like}`).order("name").limit(N),
    db.from("contacts").select("id, name, email, business").or(`name.ilike.${like},email.ilike.${like},business.ilike.${like}`).order("created_at", { ascending: false }).limit(N),
    db
      .from("proposals")
      .select("id, number, prospect_name, prospect_business, status")
      .or(`number.ilike.${like},prospect_name.ilike.${like},prospect_business.ilike.${like},prospect_email.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(N),
    db.from("quotations").select("id, number, status, clients(name)").ilike("number", like).order("created_at", { ascending: false }).limit(N),
    db.from("invoices").select("id, number, status, clients(name)").ilike("number", like).order("created_at", { ascending: false }).limit(N),
    db.from("agreements").select("id, number, status, clients(name)").ilike("number", like).order("created_at", { ascending: false }).limit(N),
    db.from("catalog_items").select("id, name").ilike("name", like).order("name").limit(N),
  ]);

  type Doc = { id: string; number: string; status: string; clients: { name: string } | null };
  const docs = (rows: unknown, type: string, base: string): SearchHit[] =>
    ((rows ?? []) as Doc[]).map((d) => ({ type, label: d.number, sub: [d.clients?.name, d.status?.replace(/_/g, " ")].filter(Boolean).join(" · ") || null, href: `${base}/${d.id}` }));

  const hits: SearchHit[] = [
    ...((clients.data ?? []) as { id: string; name: string; contact_person: string | null; email: string | null }[]).map((c) => ({
      type: "Client",
      label: c.name,
      sub: [c.contact_person, c.email].filter(Boolean).join(" · ") || null,
      href: `/dashboard/clients/${c.id}`,
    })),
    ...((leads.data ?? []) as { id: string; name: string; email: string; business: string | null }[]).map((l) => ({
      type: "Lead",
      label: l.name,
      sub: [l.business, l.email].filter(Boolean).join(" · ") || null,
      href: "/dashboard/leads",
    })),
    ...((proposals.data ?? []) as { id: string; number: string; prospect_name: string; prospect_business: string | null; status: string }[]).map((p) => ({
      type: "Proposal",
      label: p.number,
      sub: [p.prospect_business || p.prospect_name, p.status].filter(Boolean).join(" · "),
      href: `/dashboard/proposals/${p.id}`,
    })),
    ...docs(quotations.data, "Quotation", "/dashboard/quotations"),
    ...docs(invoices.data, "Invoice", "/dashboard/invoices"),
    ...docs(agreements.data, "Agreement", "/dashboard/agreements"),
    ...((services.data ?? []) as { id: string; name: string }[]).map((s) => ({ type: "Service", label: s.name, sub: null, href: `/dashboard/catalog/${s.id}` })),
  ];

  return NextResponse.json({ hits }, { headers: { "Cache-Control": "no-store" } });
}
