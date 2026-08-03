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

export type CallerAccess =
  | { ok: true; caller: User }
  | { ok: false; status: 401 | 403; code: "unauthorized" | "access_expired" };

/**
 * getCaller + the access check (login build): expired trial/teaching
 * accounts get a typed 403 `access_expired` so the client can route them to
 * /expired. Mirrors lib/server/access.ts semantics:
 *  - profile row cleanly MISSING => no access (deleted-user protection —
 *    Supabase does not revoke live JWTs on delete);
 *  - profile QUERY ERROR => fail-open with a warning (DB outage or the
 *    profiles migration not yet applied; bricking the API on a transient
 *    error is worse than briefly not enforcing expiry).
 */
export async function getCallerWithAccess(
  supabase: SupabaseClient<Database>,
): Promise<CallerAccess> {
  const caller = await getCaller(supabase);
  if (!caller) return { ok: false, status: 401, code: "unauthorized" };

  const { data: row, error } = await supabase
    .from("profiles")
    .select("access_expires_at")
    .eq("id", caller.id)
    .maybeSingle();

  if (error) {
    console.warn(`[access] API profile read failed (fail-open): ${error.message}`);
    return { ok: true, caller };
  }
  if (!row) return { ok: false, status: 403, code: "access_expired" };
  const exp = row.access_expires_at;
  if (exp !== null && new Date(exp).getTime() <= Date.now()) {
    return { ok: false, status: 403, code: "access_expired" };
  }
  return { ok: true, caller };
}
