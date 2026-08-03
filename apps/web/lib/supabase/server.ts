import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Cookie-session Supabase client for SERVER components and cookie-writing
 * route handlers (/auth/confirm). Reads the session the browser client
 * stores in cookies.
 *
 * Server components cannot write cookies — `setAll` swallows that case (the
 * proxy is responsible for refreshing tokens on navigation, so a session
 * refreshed here would be re-refreshed there anyway).
 *
 * NOT for the Bearer-authenticated API routes — those keep
 * `lib/server/userSupabase.ts` (Authorization header, per-request, no
 * cookies), deliberately: header auth is CSRF-immune on mutations.
 */
export async function getServerComponentSupabase(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY)");
  }
  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — cookie writes are not allowed
          // there. Safe to ignore: the proxy refreshes sessions.
        }
      },
    },
  });
}
