import Image from "next/image";
import Link from "next/link";
import { db } from "@/lib/dashboard/db";
import { requirePortalUser } from "@/lib/portal/auth";
import SignOutButton from "@/components/portal/SignOutButton";

/**
 * The signed-in portal. proxy.ts already turns away anyone without the
 * client role; this re-checks (a middleware bypass must fail closed), and
 * every page below scopes its data to the signed-in user's client id.
 */
export default async function PortalAppLayout({ children }: { children: React.ReactNode }) {
  const { user, clientId } = await requirePortalUser();
  const { data: client } = await db.from("clients").select("name").eq("id", clientId).maybeSingle();

  return (
    <>
      <header className="border-b border-ink/10 bg-white/70 backdrop-blur">
        <div className="max-w-4xl mx-auto px-5 h-16 flex items-center gap-4">
          <Link href="/portal" aria-label="Portal home">
            <Image src="/brand/logo-horizontal.svg" alt="Ads by Shoaib" width={168} height={55} className="h-7 w-auto" priority />
          </Link>
          <span className="hidden sm:inline font-mono uppercase text-tag tracking-widest text-ink-subtle">Client portal</span>
          <div className="ml-auto flex items-center gap-3 min-w-0">
            <span className="text-small text-ink-muted truncate hidden sm:inline">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
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
