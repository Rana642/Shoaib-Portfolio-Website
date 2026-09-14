import Link from "next/link";
import Image from "next/image";
import Button from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-16 md:h-20 flex items-center container-wide">
        <Link href="/" aria-label="Ads by Shoaib home">
          <Image src="/brand/logo-horizontal.svg" alt="Ads by Shoaib" width={168} height={55} className="h-9 md:h-10 w-auto" />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center">
        <div className="container-narrow text-center py-20">
          <span className="font-serif italic text-hero text-ink-faint leading-none select-none">
            404
          </span>
          <h1 className="font-serif italic text-h2 mt-6">
            This page didn't convert<span className="text-citrus">.</span>
          </h1>
          <p className="text-body-lg text-ink-muted mt-4 max-w-md mx-auto">
            The link's broken or the page moved. Either way, let's get you back on track.
          </p>
          <div className="flex flex-wrap justify-center gap-4 mt-10">
            <Button href="/" withArrow>
              Back to home
            </Button>
            <Button href="/contact" variant="secondary" withArrow>
              Get a free audit
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
