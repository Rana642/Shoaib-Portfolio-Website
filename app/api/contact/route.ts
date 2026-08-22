import { NextResponse } from "next/server";
import { z } from "zod";

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

  // Phase 7 TODO: save to Supabase `contacts`, notify via Resend,
  // auto-reply to submitter, fire Meta CAPI lead event.
  console.log("[contact] submission received:", {
    name: parsed.data.name,
    email: parsed.data.email,
    business: parsed.data.business,
    budget: parsed.data.budget,
  });

  return NextResponse.json({ ok: true });
}
