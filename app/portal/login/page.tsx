import { Suspense } from "react";
import AuthCard from "@/components/portal/AuthCard";
import PortalLoginForm from "@/components/portal/PortalLoginForm";

export const metadata = { title: "Sign in" };

export default function PortalLoginPage() {
  return (
    <AuthCard title="Sign in" intro="Your private space for working with me — accounts, and soon your planner and reports.">
      <Suspense>
        <PortalLoginForm />
      </Suspense>
    </AuthCard>
  );
}
