import Image from "next/image";
import Link from "next/link";
import { db } from "@/lib/dashboard/db";
import { can, requirePortalUser } from "@/lib/portal/auth";
import SignOutButton from "@/components/portal/SignOutButton";
import PortalNav from "@/components/portal/PortalNav";

/**
 * The signed-in portal. proxy.ts already turns away anyone without the
 * client role; this re-checks (a middleware bypass must fail closed), and
 * every page below scopes its data to the signed-in user's client id and
 * checks their features.
 */
export default async function PortalAppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePortalUser();
  const { data: client } = await db.from("clients").select("name").eq("id", ctx.clientId).maybeSingle();

  const links = [
    { href: "/portal", label: "Home" },
    ...(can(ctx, "intakes") ? [{ href: "/portal/intakes", label: "Intake forms" }] : []),
    ...(ctx.role === "owner" && can(ctx, "team") ? [{ href: "/portal/team", label: "Team" }] : []),
  ];

  return (
    <>
      <header className="border-b border-ink/10 bg-white/70 backdrop-blur">
        <div className="max-w-4xl mx-auto px-5 h-16 flex items-center gap-4">
          <Link href="/portal" aria-label="Portal home">
            <Image src="/brand/logo-horizontal.svg" alt="Ads by Shoaib" width={168} height={55} className="h-7 w-auto" priority />
          </Link>
          <span className="hidden sm:inline font-mono uppercase text-tag tracking-widest text-ink-subtle">Client portal</span>
          <div className="ml-auto flex items-center gap-3 min-w-0">
            <span className="text-small text-ink-muted truncate hidden sm:inline">{ctx.user.email}</span>
            <SignOutButton />
          </div>
        </div>
        {links.length > 1 && <PortalNav links={links} />}
      </header>
      <main className="max-w-4xl mx-auto px-5 py-8 md:py-12">
        {client ? (
          children
        ) : (
          <p className="text-body text-ink-muted">This portal isn&apos;t active any more. If that&apos;s unexpected, get in touch with me.</p>
        )}
      </main>
    </>
  );
}
