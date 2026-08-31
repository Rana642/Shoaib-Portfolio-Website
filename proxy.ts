import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Two jobs on every request:
 *  1. Security headers (CSP, HSTS, etc.) on all HTML routes — defence in
 *     depth for the whole site, and especially the browser-side vault,
 *     where a strong Content-Security-Policy is the main guard against an
 *     XSS script ever reading a decrypted secret.
 *  2. Auth for /dashboard: refreshes the Supabase session cookie and
 *     redirects to login when there's no valid session (a middleware-level
 *     guard; the dashboard layout re-checks too, so a bypass fails closed —
 *     see CVE-2025-29927: middleware alone is never the only boundary).
 *
 * Named `proxy` in `proxy.ts` — Next 16 renamed this from `middleware`.
 */

function buildCsp(nonce: string): string {
  // Next's dev tooling (HMR / Fast Refresh) needs eval; production never
  // does, so this only loosens local development, not the live site.
  const devEval = process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : "";
  return [
    "default-src 'self'",
    // nonce + strict-dynamic: modern browsers trust only our nonced scripts
    // and whatever they load (Next hydration, GTM/Pixel init) and ignore the
    // 'unsafe-inline'/https: fallback, which is there only for old browsers.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' https:${devEval}`,
    // Inline styles are needed by Next, next/font, and React style props;
    // style injection is far lower-risk than script injection.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.r2.cloudflarestorage.com https://cdn.sanity.io https://*.sanity.io https://*.apicdn.sanity.io https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://connect.facebook.net https://*.facebook.com https://vitals.vercel-insights.com",
    "frame-src 'self' https://www.googletagmanager.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function applySecurityHeaders(res: NextResponse, pathname: string, nonce: string) {
  // Sanity Studio is a heavy SPA (eval/workers/blobs) that a strict CSP
  // would break — it's an admin-only tool, so it keeps the other headers
  // but not the CSP.
  if (!pathname.startsWith("/studio")) {
    res.headers.set("Content-Security-Policy", buildCsp(nonce));
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
  const nonce = btoa(crypto.randomUUID());

  // Make the nonce available to the render so Next tags its scripts with it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

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
            response = NextResponse.next({ request: { headers: requestHeaders } });
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

  applySecurityHeaders(response, pathname, nonce);
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
