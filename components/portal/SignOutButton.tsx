"use client";

import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { LogOut } from "lucide-react";
import { buttonStyles } from "@/components/dashboard/ui";

export default function SignOutButton() {
  const router = useRouter();
  const signOut = async () => {
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    await supabase.auth.signOut();
    router.push("/portal/login");
    router.refresh();
  };
  return (
    <button type="button" onClick={signOut} className={`${buttonStyles.secondary} px-3 py-2`}>
      <LogOut className="size-4" aria-hidden />
      Sign out
    </button>
  );
}
