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
  return false;
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
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);

  const { pathname, search } = request.nextUrl;
  if (signedIn || isPublic(pathname)) return response;

  // Anonymous on a gated page → landing with a sanitized return-to.
  const redirectUrl = new URL("/", request.url);
  const next = pathname + search;
  if (/^\/(?!\/)/.test(next)) redirectUrl.searchParams.set("next", next);
  const redirect = NextResponse.redirect(redirectUrl);
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
