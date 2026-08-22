import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { resend, isResendConfigured, fromEmail } from "@/lib/resend";
import { newsletterWelcomeEmail } from "@/lib/email-templates";

const schema = z.object({ email: z.string().email().max(320) });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 422 });
  }

  const { email } = parsed.data;

  if (isSupabaseConfigured) {
    const { error } = await supabaseAdmin
      .from("subscribers")
      .upsert({ email }, { onConflict: "email", ignoreDuplicates: true });
    if (error) console.error("[newsletter] Supabase insert failed:", error.message);
  }

  if (isResendConfigured) {
    try {
      await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: "You're in",
        html: newsletterWelcomeEmail(),
      });
    } catch (error) {
      console.error("[newsletter] Resend send failed:", error);
    }
  }

  return NextResponse.json({ ok: true });
}
