import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/dashboard/auth";
import { linkedinPersonalAuthorizeUrl } from "@/lib/social-linkedin-personal";

/** Step 1 of connecting a personal LinkedIn profile: off to LinkedIn's
 *  consent screen, carrying the project id as `state`. */
export async function GET(request: Request) {
  const user = await getAdminUser();
  if (!user) return NextResponse.redirect(new URL("/dashboard/login", request.url));

  const url = new URL(request.url);
  const projectId = url.searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "Missing project_id." }, { status: 400 });

  try {
    return NextResponse.redirect(await linkedinPersonalAuthorizeUrl(url.origin, projectId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Couldn't start the LinkedIn sign-in." }, { status: 500 });
  }
}
