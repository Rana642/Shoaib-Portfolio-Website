"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/dashboard/db";
import { createAuthClient } from "@/lib/dashboard/auth";
import { portalClientId } from "@/lib/dashboard/roles";
import { findAuthUserByEmail, portalWelcomeUrl } from "@/lib/dashboard/portal-users";
import { rateLimit } from "@/lib/rate-limit";
import { resend, isResendConfigured, fromEmail } from "@/lib/resend";
import { portalResetEmail } from "@/lib/email-templates";

// Public (signed-out) actions for the portal's login screens — every one is
// rate-limited, and none reveals whether an email has portal access.

async function ip() {
  const h = await headers();
  return h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}

const MIN_PASSWORD = 10;

/** Emails a reset link — but only to an existing portal login, and always
 *  answers the same way, so it can't be used to probe who's a client. */
export async function requestPortalPasswordReset(email: string) {
  const parsed = z.string().trim().toLowerCase().email().safeParse(email);
  if (!parsed.success) return { error: "Enter a valid email address." };
  const target = parsed.data;

  // The per-email key is hashed so the rate_limits table never collects addresses.
  const emailKey = createHash("sha256").update(target).digest("hex").slice(0, 32);
  const allowed =
    (await rateLimit(`portal-reset:ip:${await ip()}`, 5, 600)) && (await rateLimit(`portal-reset:email:${emailKey}`, 3, 3600));
  if (!allowed) return { error: "Too many requests — try again in a few minutes." };

  const user = await findAuthUserByEmail(target).catch(() => null);
  if (user && portalClientId(user) && isResendConfigured) {
    const { data: link } = await db.auth.admin.generateLink({ type: "recovery", email: target });
    if (link?.properties?.hashed_token) {
      const { error } = await resend.emails.send({
        from: fromEmail,
        to: target,
        subject: "Reset your client portal password",
        html: portalResetEmail({ url: portalWelcomeUrl(link.properties.hashed_token, "recovery") }),
      });
      if (error) console.error("[portal] reset email failed:", error);
    }
  }
  return { ok: true };
}

const welcomeSchema = z.object({
  token: z.string().min(10).max(200),
  type: z.enum(["invite", "recovery"]),
  password: z.string().min(MIN_PASSWORD, `Use at least ${MIN_PASSWORD} characters.`).max(128),
});

/**
 * Redeems an invite / reset link and sets the password in one step. The
 * token is only spent here, when the person submits — see portalWelcomeUrl.
 */
export async function completePortalWelcome(token: string, type: string, password: string) {
  const parsed = welcomeSchema.safeParse({ token, type, password });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (!(await rateLimit(`portal-welcome:ip:${await ip()}`, 10, 600))) {
    return { error: "Too many attempts — try again in a few minutes." };
  }

  const supabase = await createAuthClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: parsed.data.token, type: parsed.data.type });
  if (error || !data.user) {
    return {
      error:
        parsed.data.type === "recovery"
          ? "This link has expired or was already used — request a new one below."
          : "This link has expired or was already used — ask Shoaib to resend your invite.",
      expired: true,
    };
  }
  if (!portalClientId(data.user)) {
    await supabase.auth.signOut();
    return { error: "This link isn't for the client portal." };
  }

  const { error: pwError } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (pwError) return { error: pwError.message };

  redirect("/portal");
}
