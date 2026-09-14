import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import LoginForm from "@/components/dashboard/LoginForm";

export const metadata: Metadata = {
  title: "Sign in — Dashboard",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-ink px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <Image src="/brand/logo-horizontal-light.svg" alt="Ads by Shoaib" width={168} height={55} className="h-10 w-auto mx-auto" />
          <p className="font-mono uppercase text-tag tracking-widest text-cloud/40 mt-3">
            Dashboard
          </p>
        </div>
        {/* LoginForm reads the ?next= param, which needs a Suspense
            boundary to prerender. */}
        <Suspense fallback={<div className="h-64" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
