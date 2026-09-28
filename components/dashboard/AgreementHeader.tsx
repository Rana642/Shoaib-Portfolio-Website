import type { Settings } from "@/lib/dashboard/types";

/** The agreement's document header — business details on the left, the
 *  agreement number on the right. Shown on the client's link, and printed
 *  in place of the dashboard's page heading. */
export default function AgreementHeader({
  settings,
  number,
  className = "",
}: {
  settings: Settings;
  number: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap justify-between gap-8 pb-8 border-b-2 border-citrus ${className}`}>
      <div>
        <p className="font-serif italic text-h3 leading-none">
          {settings.business_name}
          <span className="text-citrus not-italic font-sans">.</span>
        </p>
        <div className="text-small text-ink-muted mt-3 space-y-0.5">
          {settings.business_address && <p>{settings.business_address}</p>}
          {settings.business_email && <p>{settings.business_email}</p>}
          {settings.business_phone && <p>{settings.business_phone}</p>}
        </div>
      </div>
      <div className="text-right">
        <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">Agreement</p>
        <p className="font-serif italic text-h3 mt-1 leading-none">{number}</p>
      </div>
    </div>
  );
}
