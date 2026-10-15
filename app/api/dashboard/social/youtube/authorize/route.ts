import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/dashboard/auth";
import { youtubeAuthorizeUrl } from "@/lib/social-youtube";

/** Starts the YouTube connect for one project — Google sign-in comes back
 *  through /api/gbp/callback with state "yt:<project id>". */
export async function GET(request: Request) {
  const user = await getAdminUser();
  if (!user) return NextResponse.redirect(new URL("/dashboard/login", request.url));

  const url = new URL(request.url);
  const projectId = url.searchParams.get("project_id") ?? "";
  if (!z.string().uuid().safeParse(projectId).success) return NextResponse.json({ error: "Missing project_id." }, { status: 400 });

  try {
    return NextResponse.redirect(await youtubeAuthorizeUrl(url.origin, projectId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Couldn't start the YouTube connect." }, { status: 500 });
  }
}
