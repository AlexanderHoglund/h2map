import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type ServerSupabase = SupabaseClient<Database>;

let cached: ServerSupabase | null = null;
let warned = false;

/**
 * Server-side Supabase client. Prefers the secret (service-role) key so
 * profile-cache writes bypass RLS; falls back to the anon key when the secret
 * is not configured — reads still work, cache writes fail soft upstream.
 */
export function getServerSupabase(): ServerSupabase {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || (!secretKey && !anonKey)) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (and SUPABASE_SECRET_KEY for cache writes) in apps/web/.env.local",
    );
  }
  if (!secretKey && !warned) {
    warned = true;
    console.warn(
      "SUPABASE_SECRET_KEY is not set — using the anon key; resource-profile cache writes will be skipped (RLS).",
    );
  }
  cached = createClient<Database>(url, secretKey ?? anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
