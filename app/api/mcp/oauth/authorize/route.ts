import { NextResponse } from "next/server";
import { getUser } from "@/lib/dashboard/auth";
import { getClient, createAuthorizationCode } from "@/lib/mcp-oauth";

/**
 * OAuth authorize endpoint — the only human ever able to reach this consent
 * screen is whoever is already logged into /dashboard (reuses that same
 * auth), so there's no separate MCP-specific account system: approving here
 * just means "yes, this Claude connection acts as me."
 */
function readParams(url: URL) {
  return {
    client_id: url.searchParams.get("client_id") || "",
    redirect_uri: url.searchParams.get("redirect_uri") || "",
    code_challenge: url.searchParams.get("code_challenge") || "",
    code_challenge_method: url.searchParams.get("code_challenge_method") || "",
    state: url.searchParams.get("state") || "",
  };
}

async function validate(params: ReturnType<typeof readParams>) {
  if (!params.client_id || !params.redirect_uri || !params.code_challenge) {
    return { error: "Missing required parameters." };
  }
  if (params.code_challenge_method !== "S256") {
    return { error: "Only S256 code_challenge_method is supported." };
  }
  const client = await getClient(params.client_id);
  if (!client) return { error: "Unknown client_id." };
  if (!client.redirect_uris.includes(params.redirect_uri)) {
    return { error: "redirect_uri does not match this client's registration." };
  }
  return { client };
}

function consentHtml(params: ReturnType<typeof readParams>, clientName: string | null): string {
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Connect to Ads by Shoaib</title>
<style>
  body { font-family: system-ui, sans-serif; background: #FAFAFA; color: #0F0F14; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { background: white; border: 1px solid rgba(15,15,20,0.1); border-radius: 16px; padding: 32px; max-width: 400px; width: 100%; }
  h1 { font-size: 1.25rem; margin: 0 0 8px; }
  p { color: rgba(15,15,20,0.7); font-size: 0.9rem; line-height: 1.5; }
  .actions { display: flex; gap: 12px; margin-top: 24px; }
  button { flex: 1; padding: 12px; border-radius: 8px; font-weight: 500; cursor: pointer; border: none; font-size: 0.9rem; }
  .approve { background: #0F0F14; color: #FAFAFA; }
  .deny { background: transparent; border: 1px solid rgba(15,15,20,0.2); color: #0F0F14; }
</style></head>
<body>
  <form method="POST" class="card">
    <h1>Connect to Ads by Shoaib</h1>
    <p><strong>${escape(clientName || "This app")}</strong> wants to access your adsbyshoaib.com tools: the social poster (queue, caption, schedule posts) and marketing APIs (Google Ads, Meta Ads, GA4, Search Console, Tag Manager) — including creating and editing live campaigns/tags.</p>
    <input type="hidden" name="client_id" value="${escape(params.client_id)}">
    <input type="hidden" name="redirect_uri" value="${escape(params.redirect_uri)}">
    <input type="hidden" name="code_challenge" value="${escape(params.code_challenge)}">
    <input type="hidden" name="state" value="${escape(params.state)}">
    <div class="actions">
      <button type="submit" name="action" value="deny" class="deny">Deny</button>
      <button type="submit" name="action" value="approve" class="approve">Approve</button>
    </div>
  </form>
</body></html>`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = readParams(url);
  const result = await validate(params);
  if ("error" in result) return NextResponse.json({ error: "invalid_request", error_description: result.error }, { status: 400 });

  const user = await getUser();
  if (!user) {
    const next = `${url.pathname}${url.search}`;
    return NextResponse.redirect(new URL(`/dashboard/login?next=${encodeURIComponent(next)}`, url.origin));
  }

  return new NextResponse(consentHtml(params, result.client.client_name), { headers: { "Content-Type": "text/html" } });
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "access_denied", error_description: "Not logged in." }, { status: 401 });

  const form = await request.formData();
  const params = {
    client_id: String(form.get("client_id") || ""),
    redirect_uri: String(form.get("redirect_uri") || ""),
    code_challenge: String(form.get("code_challenge") || ""),
    code_challenge_method: "S256",
    state: String(form.get("state") || ""),
  };
  const action = String(form.get("action") || "");

  const result = await validate(params);
  if ("error" in result) return NextResponse.json({ error: "invalid_request", error_description: result.error }, { status: 400 });

  const redirectUrl = new URL(params.redirect_uri);
  if (params.state) redirectUrl.searchParams.set("state", params.state);

  // 303, not the default 307: this redirect follows a POST (the consent
  // form submission), and only 303 tells the browser to switch to GET for
  // the target — Claude's OAuth callback expects a GET with ?code=/?error=,
  // not a re-issued POST.
  if (action !== "approve") {
    redirectUrl.searchParams.set("error", "access_denied");
    return NextResponse.redirect(redirectUrl.toString(), 303);
  }

  const code = await createAuthorizationCode({
    clientId: params.client_id,
    redirectUri: params.redirect_uri,
    codeChallenge: params.code_challenge,
  });
  redirectUrl.searchParams.set("code", code);
  return NextResponse.redirect(redirectUrl.toString(), 303);
}
