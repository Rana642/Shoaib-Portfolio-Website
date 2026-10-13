import { getAdminUser } from "@/lib/dashboard/auth";
import { loadMoney } from "@/lib/dashboard/finance";

/** CSV of every line of money in and out in a period — for an accountant or a spreadsheet. */
export async function GET(request: Request) {
  const user = await getAdminUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const params = new URL(request.url).searchParams;
  const valid = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const from = valid(params.get("from"));
  const to = valid(params.get("to"));
  if (!from || !to || from > to) return new Response("Pick a valid period.", { status: 400 });

  const { rows } = await loadMoney({ from, to });
  const cell = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Date", "Type", "Category", "Paid to / from", "Client", "Description", "Amount", "Currency", "Rate", "PKR", "Client money", "Method", "Reference", "Notes"];
  const lines = [...rows]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((r) =>
      [
        r.date,
        r.kind === "income" ? "Money in" : "Money out",
        r.categoryLabel,
        r.party,
        r.clientName,
        r.description,
        r.amount.toFixed(2),
        r.currency,
        r.fxRate ?? "",
        r.pkr.toFixed(2),
        r.passThrough ? "yes" : "",
        r.method,
        r.reference,
        r.notes,
      ]
        .map(cell)
        .join(",")
    );

  // BOM so Excel opens it as UTF-8.
  return new Response("﻿" + [header.join(","), ...lines].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ads-by-shoaib-finance-${from}-to-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
