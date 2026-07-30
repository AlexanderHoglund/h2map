import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Per-request Supabase client bound to the CALLER's JWT (anon key + the
 * request's Authorization header), so every query runs under the caller's RLS
 * identity — the owner-only scenarios policy is enforced by Postgres, not by
 * route code. Contrast with `getServerSupabase()` (service role) which is for
 * server-owned data like the profile cache and must never touch scenarios on
 * a user's behalf.
 */
export function getUserSupabase(request: Request): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  const authHeader = request.headers.get("authorization") ?? "";
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: authHeader ? { headers: { Authorization: authHeader } } : {},
  });
}

/** The authenticated caller, or null (route returns 401). */
export async function getCaller(
  supabase: SupabaseClient<Database>,
): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}
