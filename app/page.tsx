import PageWrapper from "@/components/layout/PageWrapper";
import Tag from "@/components/ui/Tag";
import Button from "@/components/ui/Button";

export default function Home() {
  return (
    <PageWrapper>
      <section className="min-h-[70vh] flex items-center">
        <div className="container-narrow text-center py-32">
          <Tag>Ads by Shoaib · Performance Marketing</Tag>
          <h1 className="font-serif italic text-hero mt-8">
            The marketing engine, fully assembled
            <span className="text-citrus">.</span>
          </h1>
          <p className="text-body-lg text-ink-muted mt-6 max-w-xl mx-auto">
            Phase 2 foundation live — full home page arriving in Phase 3.
          </p>
          <div className="flex flex-wrap justify-center gap-4 mt-10">
            <Button href="/case-studies" withArrow>
              See the results
            </Button>
            <Button href="/contact" variant="secondary" withArrow>
              Get a free audit
            </Button>
          </div>
        </div>
      </section>
    </PageWrapper>
  );
}
