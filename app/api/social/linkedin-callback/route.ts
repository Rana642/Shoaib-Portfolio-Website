import { NextResponse, type NextRequest } from "next/server";
import { getAdminUser } from "@/lib/dashboard/auth";
import { exchangeLinkedInCompanyCode } from "@/lib/social-linkedin";
import { connectLinkedInAccount } from "@/lib/social-accounts";

const STATE_COOKIE = "li_company_state";

/**
 * LinkedIn's redirect target for the Company Page login — registered as an
 * Authorized redirect URL on the "Ads by Shoaib" LinkedIn app. Saves the
 * member token, refreshes it on Pages already imported, then lands on the
 * Connections page, which opens "Import LinkedIn Pages" straight away.
 */
export async function GET(request: NextRequest) {
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: "Unauthorized — log into /dashboard first, then retry the connect link." }, { status: 401 });

  const url = new URL(request.url);
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/dashboard/social?${q}`, url.origin));
    res.cookies.delete(STATE_COOKIE);
    return res;
  };
  const fail = (message: string) => back(`li_company_error=${encodeURIComponent(message.slice(0, 300))}`);

  if (url.searchParams.get("error")) return fail(url.searchParams.get("error_description") || "LinkedIn sign-in was cancelled.");
  const state = url.searchParams.get("state");
  if (!state || state !== request.cookies.get(STATE_COOKIE)?.value) return fail("The sign-in link expired or didn't match. Please try Connect with LinkedIn again.");
  const code = url.searchParams.get("code");
  if (!code) return fail("LinkedIn didn't send back a sign-in code. Please try again.");

  try {
    const { accessToken, expiresIn } = await exchangeLinkedInCompanyCode(code, url.origin);
    await connectLinkedInAccount(accessToken, expiresIn);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Connect failed.");
  }
  return back("li_company=connected");
}
