/*
 * DRAFT COPY — written in brand voice pending Shoaib's final copy files.
 * Framework: PAS (Problem → Agitate), reader language, pain-first.
 */
import AnimatedText from "@/components/ui/AnimatedText";
import Reveal from "@/components/shared/Reveal";

const pains = [
  "You've run ads before. The invoices were real; the leads weren't.",
  "Your agency sends reports you'd need a translator to read.",
  "Boosting posts felt easy — until you added up what it cost.",
  "Every guru has a new hack. None of them has seen your P&L.",
];

export default function PainPoints() {
  return (
    <section className="py-24 md:py-32">
      <div className="container-narrow">
        <Reveal>
          <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
            Sound familiar?
          </span>
        </Reveal>
        <AnimatedText
          as="h2"
          split="words"
          text="You're not short on marketing. You're short on results."
          className="font-serif italic text-h2 mt-6 max-w-2xl"
        />
        <ul className="mt-14 space-y-8">
          {pains.map((pain, i) => (
            <Reveal key={i} delay={i * 0.08}>
              <li className="flex gap-5 items-start border-b border-ink/10 pb-8">
                <span className="font-serif italic text-h3 text-ink-subtle leading-none select-none">
                  0{i + 1}
                </span>
                <p className="text-body-lg text-ink-muted max-w-xl">{pain}</p>
              </li>
            </Reveal>
          ))}
        </ul>
        <Reveal delay={0.2}>
          <p className="text-body-lg mt-12 max-w-xl">
            If any of that sounds familiar — you're exactly who I built this practice for.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
