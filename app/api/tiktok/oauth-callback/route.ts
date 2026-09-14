import { NextResponse } from "next/server";
import { getUser } from "@/lib/dashboard/auth";
import { db } from "@/lib/dashboard/db";
import { decryptField, isApiVaultCryptoConfigured } from "@/lib/api-vault-crypto";

/**
 * One-off manual-testing helper — TikTok has no public "OAuth Playground"
 * equivalent to Google's, so this stands in for one: TikTok redirects here
 * with ?code=..., we exchange it server-side for tokens using the client
 * key/secret already in the API Vault, and just display the JSON (never
 * auto-saved — Shoaib copies the refresh_token back into chat, same as the
 * Google flow, so it goes through the same reviewed save step every other
 * credential did this session). Gated behind dashboard auth since it's
 * otherwise a public, unauthenticated route.
 */
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized — log into /dashboard first, then retry the TikTok authorize link." }, { status: 401 });

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const errorParam = url.searchParams.get("error");
  if (errorParam) {
    return NextResponse.json({ error: errorParam, error_description: url.searchParams.get("error_description") }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: "No ?code= in the callback URL." }, { status: 400 });
  }

  if (!isApiVaultCryptoConfigured) {
    return NextResponse.json({ error: "API_VAULT_ENCRYPTION_KEY is not configured." }, { status: 500 });
  }

  const { data: row, error: dbError } = await db.from("api_credentials").select("fields").eq("service", "tiktok").maybeSingle();
  if (dbError || !row) {
    return NextResponse.json({ error: "No 'tiktok' credential in the API Vault yet — save client_key/client_secret first." }, { status: 500 });
  }

  let client_key: string;
  let client_secret: string;
  try {
    client_key = decryptField(row.fields.client_key);
    client_secret = decryptField(row.fields.client_secret);
  } catch {
    return NextResponse.json({ error: "Couldn't decrypt the stored TikTok client_key/client_secret." }, { status: 500 });
  }

  const redirect_uri = `${url.origin}/api/tiktok/oauth-callback`;
  const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: new URLSearchParams({ client_key, client_secret, code, grant_type: "authorization_code", redirect_uri }),
  });
  const tokenBody = await tokenRes.json();

  // Plain JSON, not HTML — copy/paste the refresh_token straight out.
  return NextResponse.json({ ok: tokenRes.ok, status: tokenRes.status, token_response: tokenBody }, { status: tokenRes.ok ? 200 : 502 });
}
