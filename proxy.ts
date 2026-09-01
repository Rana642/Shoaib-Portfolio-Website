import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Two jobs on every request:
 *  1. Security headers (CSP, HSTS, etc.) on all HTML routes — defence in
 *     depth for the whole site, and especially the browser-side vault.
 *  2. Auth for /dashboard: refreshes the Supabase session cookie and
 *     redirects to login when there's no valid session (a middleware-level
 *     guard; the dashboard layout re-checks too, so a bypass fails closed —
 *     see CVE-2025-29927: middleware alone is never the only boundary).
 *
 * Named `proxy` in `proxy.ts` — Next 16 renamed this from `middleware`.
 *
 * CSP note — why no nonce/strict-dynamic: most of this site is statically
 * prerendered, so Next bakes its <script> tags at build time and there is no
 * per-request nonce to stamp on them. A nonce + 'strict-dynamic' policy
 * therefore blocks EVERY script on a static page (it once took the whole
 * marketing site blank). Forcing the entire site to render dynamically just
 * to carry a nonce would wreck static performance and inflate hosting cost.
 * So we run a nonce-free policy: with no nonce present, browsers honour
 * 'unsafe-inline' (lets Next's inline bootstrap run), 'self' serves the
 * hashed /_next chunks, and https: covers GTM/GA/Pixel/Vercel. The real
 * anti-exfiltration teeth for the vault are the tight connect-src and
 * img-src allowlists below: even if a script did run, it can't fetch or
 * beacon a decrypted secret out to an attacker-controlled host.
 */

function buildCsp(): string {
  // Next's dev tooling (HMR / Fast Refresh) needs eval; production never
  // does, so this only loosens local development, not the live site.
  const devEval = process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https:${devEval}`,
    // Inline styles are needed by Next, next/font, and React style props;
    // style injection is far lower-risk than script injection.
    "style-src 'self' 'unsafe-inline'",
    // No blanket https: — that would let an XSS payload beacon a stolen
    // vault secret out as an <img> request to any host. Only our own
    // images, inline data/blob, and Sanity's CDN.
    "img-src 'self' data: blob: https://cdn.sanity.io",
    "font-src 'self' data:",
    // Locks where fetch/XHR/WebSocket (and analytics beacons) may go — the
    // main guard against an injected script exfiltrating a vault secret.
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.r2.cloudflarestorage.com https://cdn.sanity.io https://*.sanity.io https://*.apicdn.sanity.io https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://connect.facebook.net https://*.facebook.com https://vitals.vercel-insights.com",
    "frame-src 'self' https://www.googletagmanager.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function applySecurityHeaders(res: NextResponse, applyCsp: boolean) {
  // Sanity Studio is a heavy SPA (eval/workers/blobs) that a strict CSP
  // would break — it's an admin-only tool, so it keeps the other headers
  // but not the CSP.
  if (applyCsp) {
    res.headers.set("Content-Security-Policy", buildCsp());
  }
  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), browsing-topics=()"
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const applyCsp = !pathname.startsWith("/studio");

  let response = NextResponse.next({ request });

  // ── Auth: only /dashboard needs a session; skip the Supabase round-trip
  //    everywhere else so marketing/API stay fast. ──
  if (pathname.startsWith("/dashboard")) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const isLoginPage = pathname === "/dashboard/login";

    if (!user && !isLoginPage) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/dashboard/login";
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (user && isLoginPage) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = "/dashboard";
      dashboardUrl.search = "";
      return NextResponse.redirect(dashboardUrl);
    }
  }

  applySecurityHeaders(response, applyCsp);
  return response;
}

export const config = {
  // Run on every route except Next's static assets and static files, so
  // security headers reach all HTML/JSON responses.
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf|txt|xml|json)$).*)",
    },
  ],
};
