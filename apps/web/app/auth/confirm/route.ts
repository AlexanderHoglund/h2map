import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getServerComponentSupabase } from "@/lib/supabase/server";

/**
 * Email link landing: confirm-signup and password-recovery tokens arrive
 * here in token-hash form (see docs/SUPABASE_SETUP.md §10 email templates):
 *
 *   GET /auth/confirm?token_hash=…&type=email|recovery&next=/…
 *
 * verifyOtp exchanges the hash for a session (written to cookies via the
 * server client), then redirects to a SANITIZED next: same-origin
 * single-slash paths only — never an absolute URL from the query string.
 */

function sanitizeNext(next: string | null, fallback: string): string {
  if (next && /^\/(?!\/)/.test(next)) return next;
  return fallback;
}

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const fallback = type === "recovery" ? "/reset-password" : "/";
  const next = sanitizeNext(searchParams.get("next"), fallback);

  if (tokenHash && type) {
    const supabase = await getServerComponentSupabase();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }
  // Invalid/expired link — land on the home page with a typed error the
  // landing client can surface.
  return NextResponse.redirect(new URL("/?authError=confirm", origin));
}
