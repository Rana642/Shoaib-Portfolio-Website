/*
 * DRAFT COPY — each reason = what + how it benefits the client.
 */
import Reveal from "@/components/shared/Reveal";

const reasons = [
  {
    title: "One accountable brain",
    description:
      "Strategy, media buying, and reporting sit with one specialist — no hand-offs, no telephone game between departments.",
  },
  {
    title: "Evidence over opinions",
    description:
      "Every recommendation traces back to a number in your account, not a trend on someone's feed.",
  },
  {
    title: "$2.5M+ already managed",
    description:
      "Across 8 industries — which means the expensive mistakes are already paid for. By someone else.",
  },
  {
    title: "Managed, not just monitored",
    description:
      "Your account gets decisions every week — not a screenshot of a dashboard once a month.",
  },
  {
    title: "Full-funnel view",
    description:
      "From first impression to thank-you page, one connected system — not a pile of disconnected tactics.",
  },
];

export default function WhyChooseUs() {
  return (
    <section className="py-24 md:py-32 bg-white/40">
      <div className="container-wide">
        <Reveal>
          <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
            Why this practice
          </span>
          <h2 className="font-serif italic text-h2 mt-6 max-w-2xl">
            Five reasons clients stay after the first quarter.
          </h2>
        </Reveal>

        {/* Horizontal scroll on mobile, grid on desktop */}
        <div className="mt-14 flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory lg:grid lg:grid-cols-5 lg:overflow-visible lg:pb-0">
          {reasons.map((reason, i) => (
            <Reveal
              key={reason.title}
              delay={i * 0.07}
              className="min-w-[75%] sm:min-w-[45%] lg:min-w-0 snap-start"
            >
              <div className="h-full border-t-2 border-citrus pt-6">
                <span className="font-serif italic text-hero text-cobalt leading-none select-none">
                  {i + 1}
                </span>
                <h3 className="text-body-lg font-semibold mt-4">{reason.title}</h3>
                <p className="text-small text-ink-muted mt-3">{reason.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
