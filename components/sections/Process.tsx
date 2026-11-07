/*
 * How an engagement starts — three steps that remove the "what happens
 * after I book?" worry right before the ask.
 */
import Reveal from "@/components/shared/Reveal";
import Button from "@/components/ui/Button";

const steps = [
  { title: "Free audit", description: "I review your ads, tracking, and funnel." },
  { title: "Fix list", description: "You get the top 3 leaks, in plain words." },
  { title: "Launch and scale", description: "We fix, test, and grow what works." },
];

const badgeColors = ["bg-citrus", "bg-cobalt", "bg-forest"];

export default function Process() {
  return (
    <section className="py-16 md:py-24">
      <div className="container-wide">
        <Reveal>
          <span className="font-mono uppercase text-tag tracking-widest text-ink-muted">
            How we start
          </span>
          <h2 className="font-serif italic text-h2 mt-6 max-w-2xl">
            Three steps to your first fix<span className="text-citrus">.</span>
          </h2>
        </Reveal>

        <ol className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {steps.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.08}>
              <li className="relative h-full flex gap-5 md:block rounded-2xl border border-ink/8 bg-white/60 backdrop-blur-sm p-6 md:p-8 shadow-sm shadow-ink/5">
                <span
                  className={`${badgeColors[i]} shrink-0 grid place-items-center size-12 rounded-full font-serif italic text-2xl text-ink shadow-md shadow-ink/15 select-none`}
                >
                  {i + 1}
                </span>
                <div className="md:mt-6">
                  <h3 className="text-body-lg font-semibold">{step.title}</h3>
                  <p className="text-body text-ink-muted mt-2">{step.description}</p>
                </div>
                {i < steps.length - 1 && (
                  <>
                    {/* mobile: line down to the next step; desktop: line across to it */}
                    <span aria-hidden className="md:hidden absolute left-12 -translate-x-1/2 top-[4.5rem] -bottom-6 w-px bg-ink/20" />
                    <span aria-hidden className="hidden md:block absolute left-20 -right-8 top-14 h-px bg-ink/20" />
                  </>
                )}
              </li>
            </Reveal>
          ))}
        </ol>

        <Reveal className="mt-14">
          <Button href="/contact" withArrow>
            Get a free audit
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
