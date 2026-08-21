/*
 * PLACEHOLDER — swap for real certification badges when provided.
 */
const signals = [
  "Meta Ads — Certified Media Buyer",
  "Google Ads — Certified",
  "GA4 & Tag Manager",
  "6+ Years in Paid Media",
  "8 Industries Served",
];

export default function TrustSignals() {
  return (
    <section className="border-t border-ink/10 bg-cloud">
      <div className="container-wide py-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
        {signals.map((signal) => (
          <span
            key={signal}
            className="font-mono uppercase text-tag tracking-widest text-ink-subtle flex items-center gap-2"
          >
            <span className="size-1.5 rounded-full bg-citrus inline-block" aria-hidden />
            {signal}
          </span>
        ))}
      </div>
    </section>
  );
}
