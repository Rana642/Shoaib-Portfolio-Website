/*
 * DRAFT COPY — pivot section, pending Shoaib's final copy files.
 */
import Reveal from "@/components/shared/Reveal";

export default function Turn() {
  return (
    <section className="py-24 md:py-32 bg-ink text-cloud relative overflow-hidden">
      {/* Vignette */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.45)_100%)]"
      />
      <div className="container-narrow relative">
        <Reveal>
          <p className="font-serif italic text-h2 max-w-3xl mx-auto text-center leading-snug">
            Ads don't fail because the platforms don't work. They fail because nobody
            connected the strategy to the targeting to the creative to the follow-through.
            That's the job. That's what this practice{" "}
            <span className="relative whitespace-nowrap">
              <span className="absolute inset-x-0 bottom-1 h-[38%] bg-citrus/70 -z-0 -rotate-1 rounded-sm" />
              <span className="relative text-ink">assembles</span>
            </span>
            .
          </p>
        </Reveal>
      </div>
    </section>
  );
}
