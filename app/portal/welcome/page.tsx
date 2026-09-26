import Link from "next/link";
import AuthCard from "@/components/portal/AuthCard";
import WelcomeForm from "@/components/portal/WelcomeForm";

export const metadata = { title: "Set your password" };

export default async function PortalWelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; type?: string }>;
}) {
  const { token, type } = await searchParams;
  const kind = type === "recovery" ? "recovery" : "invite";

  if (!token) {
    return (
      <AuthCard title="This link is incomplete">
        <p className="text-small text-ink-muted">
          Open the link straight from your email, or{" "}
          <Link href="/portal/forgot" className="underline underline-offset-2 decoration-citrus decoration-2">
            request a new one
          </Link>
          .
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={kind === "invite" ? "Welcome — set your password" : "Choose a new password"}
      intro={
        kind === "invite"
          ? "Choose a password for your client portal. You'll use it with this email address to sign in."
          : "Choose a new password for your client portal."
      }
    >
      <WelcomeForm token={token} type={kind} />
    </AuthCard>
  );
}
