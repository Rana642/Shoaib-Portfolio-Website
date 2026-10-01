import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/dashboard/auth";
import { db } from "@/lib/dashboard/db";
import { exchangeLinkedInPersonalCode, saveLinkedInPersonalAccount } from "@/lib/social-linkedin-personal";

/**
 * LinkedIn's redirect target for the personal-profile connect — registered
 * as an Authorized redirect URL on the "personal" LinkedIn app. `state` is
 * the client_projects id; only an admin can land here.
 */
export async function GET(request: Request) {
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: "Unauthorized — log into /dashboard first, then retry the connect link." }, { status: 401 });

  const url = new URL(request.url);
  const projectId = url.searchParams.get("state") ?? "";
  if (!z.string().uuid().safeParse(projectId).success) return NextResponse.json({ error: "Missing or invalid state." }, { status: 400 });
  const { data: project } = await db.from("client_projects").select("id").eq("id", projectId).maybeSingle();
  if (!project) return NextResponse.json({ error: "Unknown project." }, { status: 400 });

  const back = (q: string) => NextResponse.redirect(new URL(`/dashboard/social?project=${projectId}&${q}`, url.origin));
  if (url.searchParams.get("error")) return back(`li_error=${encodeURIComponent(url.searchParams.get("error_description") || "LinkedIn connection was cancelled.")}`);
  const code = url.searchParams.get("code");
  if (!code) return back(`li_error=${encodeURIComponent("LinkedIn didn't send a sign-in code.")}`);

  try {
    await saveLinkedInPersonalAccount(projectId, await exchangeLinkedInPersonalCode(code, url.origin));
    return back("li=connected");
  } catch (error) {
    return back(`li_error=${encodeURIComponent(error instanceof Error ? error.message : "Connect failed.")}`);
  }
}
