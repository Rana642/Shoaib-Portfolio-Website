import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/dashboard/auth";
import { authorizeUrl } from "@/lib/gbp";

/** Step 1 of connecting a client's Google Business Profile: off to Google's
 *  consent screen ("Socially Snap"), carrying the project id as `state` so
 *  /api/gbp/callback knows where to save the grant. */
export async function GET(request: Request) {
  const user = await getAdminUser();
  if (!user) return NextResponse.redirect(new URL("/dashboard/login", request.url));

  const url = new URL(request.url);
  const projectId = url.searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "Missing project_id." }, { status: 400 });

  try {
    return NextResponse.redirect(await authorizeUrl(url.origin, projectId));
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Couldn't start the Google sign-in.";
    return NextResponse.redirect(new URL(`/dashboard/gbp?project=${projectId}&error=${encodeURIComponent(msg)}`, url.origin));
  }
}
