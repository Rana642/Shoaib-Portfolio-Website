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

const borderColors = ["border-citrus", "border-cobalt", "border-forest"];

export default function Process() {
  return (
    <section className="py-16 md:py-24">
      <div className="container-wide">
        <Reveal>
          <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
            How we start
          </span>
          <h2 className="font-serif italic text-h2 mt-6 max-w-2xl">
            Three steps to your first fix<span className="text-citrus">.</span>
          </h2>
        </Reveal>

        <ol className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-14">
          {steps.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.08}>
              <li className={`h-full border-t-2 ${borderColors[i]} pt-6`}>
                <span className="font-serif italic text-hero text-ink leading-none select-none">
                  {i + 1}
                </span>
                <h3 className="text-body-lg font-semibold mt-4">{step.title}</h3>
                <p className="text-body text-ink-muted mt-2">{step.description}</p>
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
