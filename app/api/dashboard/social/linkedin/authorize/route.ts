import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/dashboard/auth";
import { linkedinCompanyAuthorizeUrl } from "@/lib/social-linkedin";

// Read back by /api/social/linkedin-callback.
const STATE_COOKIE = "li_company_state";

/** Step 1 of connecting the LinkedIn login that discovers Company Pages: off
 *  to LinkedIn's consent screen. A random `state` is kept in a short-lived
 *  cookie and checked on the way back, so a forged callback can't attach
 *  someone else's LinkedIn account. */
export async function GET(request: Request) {
  const user = await getAdminUser();
  if (!user) return NextResponse.redirect(new URL("/dashboard/login", request.url));

  const url = new URL(request.url);
  const state = randomBytes(16).toString("hex");
  try {
    const res = NextResponse.redirect(await linkedinCompanyAuthorizeUrl(url.origin, state));
    res.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
    return res;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't start the LinkedIn sign-in.";
    return NextResponse.redirect(new URL(`/dashboard/social?li_company_error=${encodeURIComponent(message.slice(0, 300))}`, url.origin));
  }
}
