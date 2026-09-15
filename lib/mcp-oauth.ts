import "server-only";
import { randomBytes, createHmac, createHash, timingSafeEqual } from "node:crypto";
import { db } from "./dashboard/db";

/**
 * Minimal, single-tenant OAuth 2.1 authorization server backing
 * app/api/mcp — lets Claude.ai (web/mobile/desktop) connect as a custom
 * connector, alongside the existing local stdio MCP server (mcp/index.ts,
 * Claude Code only). See supabase/dashboard-schema.sql for the "why" behind
 * the storage choices (opaque signed access tokens, no DB read per request;
 * codes/refresh tokens in a table since those must be revocable/single-use).
 */

const ISSUER = "https://adsbyshoaib.com";
export const MCP_RESOURCE_URL = `${ISSUER}/api/mcp`;
export const MCP_METADATA_URL = `${ISSUER}/.well-known/oauth-protected-resource`;

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days
const AUTH_CODE_TTL_SECONDS = 5 * 60;

const rawKey = process.env.MCP_OAUTH_SIGNING_KEY || "";
export const isMcpOAuthConfigured = Boolean(rawKey);

function toBase64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

type AccessTokenPayload = { cid: string; exp: number };

/** Access tokens are self-verifying (HMAC-signed) so the hot path — every
 *  actual tool call — needs no DB round trip, unlike codes/refresh tokens
 *  which are rare and must be revocable. */
export function signAccessToken(clientId: string): { token: string; expiresIn: number } {
  if (!rawKey) throw new Error("MCP_OAUTH_SIGNING_KEY is not configured.");
  const payload: AccessTokenPayload = { cid: clientId, exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS };
  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const sig = toBase64Url(createHmac("sha256", rawKey).update(payloadB64).digest());
  return { token: `${payloadB64}.${sig}`, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

export function verifyAccessToken(token: string): { clientId: string } | null {
  if (!rawKey) return null;
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;
  const expectedSig = toBase64Url(createHmac("sha256", rawKey).update(payloadB64).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromBase64Url(payloadB64).toString("utf8")) as AccessTokenPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { clientId: payload.cid };
  } catch {
    return null;
  }
}

export type McpOAuthClient = { client_id: string; client_name: string | null; redirect_uris: string[] };

export async function registerClient(clientName: string | null, redirectUris: string[]): Promise<McpOAuthClient> {
  const client_id = toBase64Url(randomBytes(24));
  const { error } = await db
    .from("mcp_oauth_clients")
    .insert({ client_id, client_name: clientName, redirect_uris: redirectUris });
  if (error) throw new Error(error.message);
  return { client_id, client_name: clientName, redirect_uris: redirectUris };
}

export async function getClient(clientId: string): Promise<McpOAuthClient | null> {
  const { data, error } = await db
    .from("mcp_oauth_clients")
    .select("client_id, client_name, redirect_uris")
    .eq("client_id", clientId)
    .maybeSingle();
  if (error || !data) return null;
  return data as McpOAuthClient;
}

export async function createAuthorizationCode(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
}): Promise<string> {
  const code = toBase64Url(randomBytes(24));
  const { error } = await db.from("mcp_oauth_codes").insert({
    code,
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    expires_at: new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return code;
}

/** Consumes an authorization code (single-use) — returns its stored
 *  redirect_uri/code_challenge if the code is valid, unexpired, and unused,
 *  marking it used in the same call so a replay can never succeed. */
export async function consumeAuthorizationCode(
  code: string,
  clientId: string
): Promise<{ redirectUri: string; codeChallenge: string } | null> {
  const { data, error } = await db
    .from("mcp_oauth_codes")
    .select("redirect_uri, code_challenge, expires_at, used, client_id")
    .eq("code", code)
    .maybeSingle();
  if (error || !data || data.client_id !== clientId || data.used) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  await db.from("mcp_oauth_codes").update({ used: true }).eq("code", code);
  return { redirectUri: data.redirect_uri, codeChallenge: data.code_challenge };
}

export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const computed = toBase64Url(createHash("sha256").update(codeVerifier).digest());
  const a = Buffer.from(computed);
  const b = Buffer.from(codeChallenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function issueRefreshToken(clientId: string): Promise<string> {
  const token = toBase64Url(randomBytes(32));
  const { error } = await db.from("mcp_oauth_refresh_tokens").insert({
    token,
    client_id: clientId,
    expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return token;
}

/** Rotates a refresh token (RFC 6749 best practice for public clients) —
 *  the old one is revoked in the same call it's redeemed, so a stolen,
 *  already-used token can't be replayed. */
export async function rotateRefreshToken(oldToken: string, clientId: string): Promise<string | null> {
  const { data, error } = await db
    .from("mcp_oauth_refresh_tokens")
    .select("client_id, expires_at, revoked")
    .eq("token", oldToken)
    .maybeSingle();
  if (error || !data || data.client_id !== clientId || data.revoked) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  await db.from("mcp_oauth_refresh_tokens").update({ revoked: true }).eq("token", oldToken);
  return issueRefreshToken(clientId);
}
