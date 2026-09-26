import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { isAdmin, portalClientId } from "@/lib/dashboard/roles";

/**
 * Two jobs on every request:
 *  1. Security headers (CSP, HSTS, etc.) on all HTML routes — defence in
 *     depth for the whole site, and especially the browser-side vault.
 *  2. Auth for /dashboard (admin) and /portal (clients): refreshes the
 *     Supabase session cookie and redirects to that area's login when the
 *     session lacks its role (a middleware-level guard; both layouts
 *     re-check too, so a bypass fails closed —
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

/** Our own R2 bucket's account-specific host (where presigned post-upload
 *  URLs point) — deliberately not the *.r2.cloudflarestorage.com wildcard,
 *  since anyone can open an R2 account and receive requests there. */
function r2Origin(): string | null {
  try {
    return new URL(process.env.S3_ENDPOINT || "").origin;
  } catch {
    return null;
  }
}

function buildCsp(pathname: string): string {
  // Next's dev tooling (HMR / Fast Refresh) needs eval; production never
  // does, so this only loosens local development, not the live site.
  const devEval = process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : "";
  // No blanket https: — that would let an XSS payload beacon a stolen
  // vault secret out as an <img> request to any host. Only our own images,
  // inline data/blob, and Sanity's CDN — plus, on the social Planner and
  // Insights pages only, the hosts their images actually live on: our R2
  // bucket (uploaded posts) and Meta's CDNs (post thumbnails from the Graph
  // API). The vault and the public site keep the original tight list.
  const imgSrc = ["'self'", "data:", "blob:", "https://cdn.sanity.io"];
  if (pathname.startsWith("/dashboard/social")) {
    const r2 = r2Origin();
    if (r2) imgSrc.push(r2);
    imgSrc.push("https://*.fbcdn.net", "https://*.cdninstagram.com");
  }
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https:${devEval}`,
    // Inline styles are needed by Next, next/font, and React style props;
    // style injection is far lower-risk than script injection.
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSrc.join(" ")}`,
    "font-src 'self' data:",
    // Locks where fetch/XHR/WebSocket (and analytics beacons) may go — the
    // main guard against an injected script exfiltrating a vault secret.
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.r2.cloudflarestorage.com https://cdn.sanity.io https://*.sanity.io https://*.apicdn.sanity.io https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://connect.facebook.net https://*.facebook.com https://vitals.vercel-insights.com",
    "frame-src 'self' https://www.googletagmanager.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    // The MCP OAuth consent form (app/api/mcp/oauth/authorize) submits to
    // itself, then the server redirects cross-origin to whichever MCP
    // client's own callback URL (Claude.ai, Claude Code's loopback, etc.) —
    // some browsers apply form-action through that redirect chain, so a
    // bare 'self' here silently blocks the approve/deny buttons from ever
    // completing. Every other route keeps the strict same-origin default.
    pathname === "/api/mcp/oauth/authorize" ? "form-action 'self' https: http://localhost:*" : "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function applySecurityHeaders(res: NextResponse, applyCsp: boolean, pathname: string) {
  // Sanity Studio is a heavy SPA (eval/workers/blobs) that a strict CSP
  // would break — it's an admin-only tool, so it keeps the other headers
  // but not the CSP.
  if (applyCsp) {
    res.headers.set("Content-Security-Policy", buildCsp(pathname));
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

type AuthArea = {
  home: string;
  login: string;
  /** Reachable without the area's role (login, password setup…). */
  publicPaths: string[];
  allows: (user: User | null) => boolean;
};

const AUTH_AREAS: Record<"dashboard" | "portal", AuthArea> = {
  dashboard: {
    home: "/dashboard",
    login: "/dashboard/login",
    publicPaths: ["/dashboard/login"],
    allows: isAdmin,
  },
  portal: {
    home: "/portal",
    login: "/portal/login",
    publicPaths: ["/portal/login", "/portal/forgot", "/portal/welcome"],
    allows: (user) => portalClientId(user) !== null,
  },
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const applyCsp = !pathname.startsWith("/studio");

  let response = NextResponse.next({ request });

  // ── Auth: only /dashboard (admin) and /portal (clients) need a session;
  //    skip the Supabase round-trip everywhere else so marketing/API stay
  //    fast. ──
  const area = pathname.startsWith("/dashboard")
    ? AUTH_AREAS.dashboard
    : pathname === "/portal" || pathname.startsWith("/portal/")
      ? AUTH_AREAS.portal
      : null;
  if (area) {
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

    // Signed in isn't enough — each area needs its own role
    // (lib/dashboard/roles.ts): admin for the dashboard, client for the
    // portal. Anyone else is treated as signed out here, which also keeps a
    // wrong-role session from ping-ponging between an area and its login.
    const allowed = area.allows(user);

    if (!allowed && !area.publicPaths.includes(pathname)) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = area.login;
      loginUrl.search = "";
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (allowed && pathname === area.login) {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = area.home;
      homeUrl.search = "";
      return NextResponse.redirect(homeUrl);
    }
  }

  applySecurityHeaders(response, applyCsp, pathname);
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
