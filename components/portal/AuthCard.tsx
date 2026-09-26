import Image from "next/image";
import { Card } from "@/components/dashboard/ui";

/** The centred card the portal's signed-out screens share. */
export default function AuthCard({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Image src="/brand/logo-horizontal.svg" alt="Ads by Shoaib" width={168} height={55} className="h-8 w-auto" priority />
        <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mt-3">Client portal</p>
        <h1 className="font-serif italic text-h3 mt-6">{title}</h1>
        {intro && <p className="text-small text-ink-muted mt-2">{intro}</p>}
        <Card variant="solid" className="p-6 mt-6">
          {children}
        </Card>
      </div>
    </main>
  );
}
