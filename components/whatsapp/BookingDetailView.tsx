import Link from "next/link";
import { ArrowLeft, Mail, MessageCircle, Phone } from "lucide-react";
import { Card } from "@/components/dashboard/ui";
import { statusLook } from "@/lib/booking-status";
import type { HotelBookingDetail } from "@/lib/hotel-bookings";
import BookingStatusPanel from "./BookingStatusPanel";

type Result = { error?: string; ok?: boolean } | undefined;
const money = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;
const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00+05:00`).toLocaleDateString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric" });
const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function waLink(phone: string, ref: string, hotel: string) {
  const digits = phone.replace(/[^\d]/g, "").replace(/^0/, "92");
  return `https://wa.me/${digits}?text=${encodeURIComponent(`Hello, regarding your booking ${ref} at ${hotel}.`)}`;
}

/** One booking, laid out like the hotel admin's booking page. */
export default function BookingDetailView({
  b,
  hotel,
  backHref,
  onStatus,
  onNotes,
}: {
  b: HotelBookingDetail;
  hotel: string;
  backHref: string;
  onStatus: (status: string) => Promise<Result>;
  onNotes: (notes: string) => Promise<Result>;
}) {
  const look = statusLook(b.status);
  const rows: [string, React.ReactNode][] = [
    ["Booking Ref", <span key="r" className="font-mono font-semibold">{b.ref}</span>],
    ["Room", b.room ?? "—"],
    ["Check-in", fmtDate(b.check_in)],
    ["Check-out", fmtDate(b.check_out)],
    ["Nights", b.nights],
    ["Guests", b.guests],
    ["Booked via", b.channel],
    ["Source", b.source ? <span key="s" className="font-mono">{b.source}</span> : "—"],
    ["Created", fmtDateTime(b.created_at)],
    ["Special request", b.special_request || "—"],
  ];

  return (
    <div>
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-small text-ink-subtle hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Back to bookings
      </Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif italic text-h2">{b.guest}</h1>
        <span className={`rounded-full px-3 py-1 text-small font-semibold ${look.cls}`}>{look.label}</span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <p className="text-small font-semibold">Guest Contact</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`tel:${b.phone}`} className="flex items-center gap-1.5 rounded-lg border border-ink/20 px-3 py-2 text-small font-medium hover:bg-ink/5">
                <Phone className="size-4" aria-hidden /> {b.phone}
              </a>
              <a
                href={waLink(b.phone, b.ref, hotel)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-small font-semibold text-white hover:brightness-95"
              >
                <MessageCircle className="size-4" aria-hidden /> WhatsApp
              </a>
              {b.email && (
                <a href={`mailto:${b.email}`} className="flex items-center gap-1.5 rounded-lg border border-ink/20 px-3 py-2 text-small font-medium hover:bg-ink/5">
                  <Mail className="size-4" aria-hidden /> {b.email}
                </a>
              )}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <table className="w-full text-small">
              <tbody>
                {rows.map(([k, v]) => (
                  <tr key={k} className="border-b border-ink/5 last:border-0">
                    <td className="w-40 px-4 py-3 text-ink-muted">{k}</td>
                    <td className="px-4 py-3">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="p-5">
            <p className="text-small font-semibold">Charges</p>
            <div className="mt-3 space-y-2 text-small">
              {b.charges.map((c) => (
                <div key={c.label} className={`flex justify-between ${c.minus || c.info ? "text-green-700" : "text-ink-muted"} ${c.info ? "italic" : ""}`}>
                  <span>{c.label}</span>
                  <span>
                    {c.minus ? "− " : ""}
                    {c.info ? `(${money(c.amount)})` : money(c.amount)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between border-t border-ink/10 pt-2 font-semibold">
                <span>Total</span>
                <span>{money(b.total)}</span>
              </div>
            </div>
          </Card>
        </div>

        <BookingStatusPanel
          current={b.status}
          notes={b.notes}
          notesLabel={b.kind === "elegant" ? "Status note" : "Internal Notes"}
          onStatus={onStatus}
          onNotes={onNotes}
        />
      </div>
    </div>
  );
}
