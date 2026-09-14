import { NextResponse } from "next/server";
import { getUser } from "@/lib/dashboard/auth";
import { db } from "@/lib/dashboard/db";
import { decryptField, isApiVaultCryptoConfigured } from "@/lib/api-vault-crypto";

/** Matches the scopes already added to the TikTok app's Login Kit + Content
 *  Posting API products (see the "Add scopes" step done in the Developer
 *  Portal): profile + stats (shown on the connections page), video.list (the
 *  recent-videos preview), video.publish/video.upload (posting itself). */
const SCOPES = "user.info.basic,user.info.stats,video.list,video.publish,video.upload";

/** Step 1 of the real TikTok connect flow — redirects to TikTok's own
 *  authorize screen, carrying the target project id as `state` so
 *  /api/tiktok/oauth-callback knows which project to attach the account to
 *  once TikTok redirects back. */
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/dashboard/login", request.url));

  const url = new URL(request.url);
  const projectId = url.searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "Missing project_id." }, { status: 400 });

  if (!isApiVaultCryptoConfigured) {
    return NextResponse.json({ error: "API_VAULT_ENCRYPTION_KEY is not configured." }, { status: 500 });
  }
  const { data: row } = await db.from("api_credentials").select("fields").eq("service", "tiktok").maybeSingle();
  if (!row) return NextResponse.json({ error: "No 'tiktok' credential in the API Vault yet." }, { status: 500 });

  let client_key: string;
  try {
    client_key = decryptField(row.fields.client_key);
  } catch {
    return NextResponse.json({ error: "Couldn't decrypt the stored TikTok client_key." }, { status: 500 });
  }

  const authorizeUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
  authorizeUrl.searchParams.set("client_key", client_key);
  authorizeUrl.searchParams.set("scope", SCOPES);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", `${url.origin}/api/tiktok/oauth-callback`);
  authorizeUrl.searchParams.set("state", projectId);

  return NextResponse.redirect(authorizeUrl.toString());
}
