import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Auth gate (Next 16 proxy — the middleware successor). OPTIMISTIC check
 * only, per the Next authentication guide: is there a valid session cookie?
 * Anonymous visitors to gated pages are redirected to the landing page with
 * a return-to. Expiry/roles are NOT checked here (no DB reads in proxy —
 * it runs on every navigation incl. prefetch); those live in
 * lib/server/access.ts (pages) and the API routes.
 *
 * Self-contained by design: proxy must not rely on shared modules/globals
 * (proxy.md), so the Supabase client is built inline from env, and the
 * cookie plumbing is the canonical @supabase/ssr updateSession pattern —
 * refreshed tokens are written to BOTH the forwarded request and the
 * response.
 *
 * /api/* is deliberately excluded by the matcher: API routes authenticate
 * themselves (Authorization: Bearer → 401/403), which keeps the anon
 * share-read endpoint public with zero special-casing here.
 */

/** Pages that render without a session. Everything else requires one. */
function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  // Anon shared-scenario viewer: the unguessable, revocable token IS the
  // capability (matches the anti-enumeration share RPC design). Flagged
  // decision — delete this line to gate shared links too.
  if (/^\/corridor\/s\/[^/]+$/.test(pathname)) return true;
  // Auth flows must work signed-out; /expired needs a session but not
  // ACCESS (an access-gated /expired would loop an expired user — it does
  // its own no-session redirect server-side).
  if (pathname === "/auth/confirm") return true;
  if (pathname === "/reset-password") return true;
  if (pathname === "/expired") return true;
  // Legal notices (privacy, cookies; imprint later). Their audience is
  // LOGGED-OUT visitors, so they must never redirect. Prefix rule so a new
  // document needs no proxy change. Hardcoded — the proxy imports nothing.
  if (pathname.startsWith("/legal/")) return true;
  return false;
}

/**
 * True when the session could not be refreshed because the refresh token is
 * gone/invalid server-side — as opposed to a transient network or 5xx blip,
 * where dropping the user's session would be wrong.
 */
function isStaleRefreshToken(error: { code?: string; message?: string }): boolean {
  const code = error.code ?? "";
  if (code === "refresh_token_not_found" || code === "refresh_token_already_used") {
    return true;
  }
  // Older/edge responses report a generic validation failure with the reason
  // only in the message.
  return /refresh token/i.test(error.message ?? "");
}

/** Landing URL carrying a sanitized same-origin return-to. */
function redirectToLanding(request: NextRequest, pathname: string, search: string): URL {
  const url = new URL("/", request.url);
  const next = pathname + search;
  if (/^\/(?!\/)/.test(next)) url.searchParams.set("next", next);
  return url;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response; // unconfigured build — fail open

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // No logic between client creation and the claims read (token refresh
  // must happen before any early return writes the response).
  const { data, error } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);

  const { pathname, search } = request.nextUrl;

  // A cookie whose refresh token the server no longer accepts (session
  // revoked, user deleted, or the token already rotated) can never recover:
  // @supabase/ssr does not clear it, so EVERY later request retries the same
  // dead token and logs `refresh_token_not_found`. Clear it once, here — the
  // only place that can write cookies on any navigation — so the visitor
  // simply becomes anonymous instead of looping on a broken session.
  if (!signedIn && error && isStaleRefreshToken(error)) {
    const cleared = isPublic(pathname)
      ? response
      : NextResponse.redirect(redirectToLanding(request, pathname, search));
    for (const { name } of request.cookies.getAll()) {
      if (/^sb-.*-auth-token(\.\d+)?$/.test(name)) cleared.cookies.delete(name);
    }
    return cleared;
  }

  if (signedIn || isPublic(pathname)) return response;

  // Anonymous on a gated page → landing with a sanitized return-to.
  const redirect = NextResponse.redirect(redirectToLanding(request, pathname, search));
  // Carry any refreshed session cookies onto the redirect.
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

export const config = {
  matcher: [
    // Everything except: API routes (they authenticate themselves), Next
    // internals, favicon, and any file with an extension (public/ assets —
    // an unmatched proxy would otherwise block CSS/JS/images).
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
