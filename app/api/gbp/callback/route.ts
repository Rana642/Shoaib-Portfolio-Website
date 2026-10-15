import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/dashboard/auth";
import { db } from "@/lib/dashboard/db";
import { discoverLocations, emailFromIdToken, exchangeCode, saveConnection } from "@/lib/gbp";
import { YOUTUBE_STATE_PREFIX, myYouTubeChannel, saveYouTubeAccount } from "@/lib/social-youtube";

/**
 * Google's redirect target for the Business Profile connect — registered as
 * an Authorized redirect URI on the Socially Snap OAuth client. `state` is
 * the client_projects id (only an admin can land here and it must be a real
 * project). Exchanges the code for a refresh token, lists every location
 * the person manages, saves it encrypted, then opens /dashboard/gbp.
 *
 * The YouTube connect shares this redirect URI: its state is "yt:<project
 * id>", and it saves the channel, then opens the Connections page.
 */
export async function GET(request: Request) {
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: "Unauthorized — log into /dashboard first, then retry the connect link." }, { status: 401 });

  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  if (state.startsWith(YOUTUBE_STATE_PREFIX)) return youtubeCallback(url, state.slice(YOUTUBE_STATE_PREFIX.length));
  const projectId = state;
  const back = (q: string) => NextResponse.redirect(new URL(`/dashboard/gbp?project=${projectId}&${q}`, url.origin));

  if (!z.string().uuid().safeParse(projectId).success) return NextResponse.json({ error: "Missing or invalid state." }, { status: 400 });
  const { data: project } = await db.from("client_projects").select("id, name").eq("id", projectId).maybeSingle();
  if (!project) return NextResponse.json({ error: "Unknown project." }, { status: 400 });

  if (url.searchParams.get("error")) return back(`error=${encodeURIComponent("Google connection was cancelled.")}`);
  const code = url.searchParams.get("code");
  if (!code) return back(`error=${encodeURIComponent("Google didn't send a sign-in code.")}`);

  try {
    const tokens = await exchangeCode(code, url.origin);
    if (!tokens.refresh_token) throw new Error("Google didn't return a refresh token — remove Socially Snap's access at myaccount.google.com/permissions and connect again.");
    const locations = await discoverLocations(tokens.access_token);
    await saveConnection(projectId, tokens.refresh_token, emailFromIdToken(tokens.id_token), locations, project.name as string);
    return back("connected=1");
  } catch (error) {
    return back(`error=${encodeURIComponent(error instanceof Error ? error.message : "Connect failed.")}`);
  }
}

async function youtubeCallback(url: URL, projectId: string) {
  const back = (q: string) => NextResponse.redirect(new URL(`/dashboard/social?project=${projectId}&${q}`, url.origin));
  if (!z.string().uuid().safeParse(projectId).success) return NextResponse.json({ error: "Missing or invalid state." }, { status: 400 });
  const { data: project } = await db.from("client_projects").select("id").eq("id", projectId).maybeSingle();
  if (!project) return NextResponse.json({ error: "Unknown project." }, { status: 400 });

  if (url.searchParams.get("error")) return back(`youtube_error=${encodeURIComponent("Google connection was cancelled.")}`);
  const code = url.searchParams.get("code");
  if (!code) return back(`youtube_error=${encodeURIComponent("Google didn't send a sign-in code.")}`);

  try {
    const tokens = await exchangeCode(code, url.origin);
    if (!tokens.refresh_token) throw new Error("Google didn't return a refresh token — remove Socially Snap's access at myaccount.google.com/permissions and connect again.");
    const channel = await myYouTubeChannel(tokens.access_token);
    await saveYouTubeAccount(projectId, channel, { access_token: tokens.access_token, refresh_token: tokens.refresh_token });
    return back(`youtube=${encodeURIComponent(channel.title)}`);
  } catch (error) {
    return back(`youtube_error=${encodeURIComponent(error instanceof Error ? error.message : "Connect failed.")}`);
  }
}
