"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Browser Supabase client (anon key). @supabase/ssr stores the session in
 * COOKIES (not localStorage) so the proxy and server components can see
 * auth state on document navigations; the cookies stay JS-readable, so
 * `auth.getSession()` still works client-side and API fetches attach
 * `Authorization: Bearer <access_token>` exactly as before — the API
 * routes' Bearer contract is unchanged.
 *
 * Auth-only + RLS-scoped reads; all corridor writes go through the API
 * routes, which re-validate payloads server-side.
 */
let cached: SupabaseClient<Database> | null = null;

export function getBrowserSupabase(): SupabaseClient<Database> {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY)");
  }
  cached = createBrowserClient<Database>(url, anonKey);
  return cached;
}
