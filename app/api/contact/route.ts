import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { resend, isResendConfigured, fromEmail, toEmail } from "@/lib/resend";
import { contactNotificationEmail, contactAutoReplyEmail } from "@/lib/email-templates";
import { sendMetaCapiEvent } from "@/lib/meta-capi";

const schema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().email().max(320),
  business: z.string().min(2).max(200),
  budget: z.string().min(1).max(100),
  message: z.string().min(10).max(5000),
});

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

  const { name, email, business, budget, message } = parsed.data;

  // Each integration is independent: a downstream hiccup (Supabase network
  // blip, a misconfigured key) must never make a real lead's message vanish
  // with a scary error — log it, keep going, still confirm to the sender.
  if (isSupabaseConfigured) {
    const { error } = await supabaseAdmin
      .from("contacts")
      .insert({ name, email, business, budget, message });
    if (error) console.error("[contact] Supabase insert failed:", error.message);
  }

  if (isResendConfigured) {
    try {
      await resend.emails.send({
        from: fromEmail,
        to: toEmail,
        replyTo: email,
        subject: `New audit request — ${business}`,
        html: contactNotificationEmail({ name, email, business, budget, message }),
      });
      await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: "Got it — audit incoming",
        html: contactAutoReplyEmail(name),
      });
    } catch (error) {
      console.error("[contact] Resend send failed:", error);
    }
  }

  await sendMetaCapiEvent({
    eventName: "Lead",
    eventSourceUrl: request.headers.get("referer") ?? "https://adsbyshoaib.com/contact",
    email,
  });

  return NextResponse.json({ ok: true });
}
