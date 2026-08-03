import { cache } from "react";
import { redirect } from "next/navigation";
import { getServerComponentSupabase } from "@/lib/supabase/server";

/**
 * Access DAL for SERVER COMPONENTS (the auth checks close to the data, per
 * the Next authentication guide — the proxy's cookie check is optimistic
 * only). Naming note: `lib/server/profiles.ts` is wind/solar RESOURCE
 * profiles; this module owns the ACCOUNT profile checks.
 *
 * Access rule: a signed-in user has access iff their profile row exists and
 * `access_expires_at` is null or in the future. A MISSING row means
 * no-access (deleted-user-with-live-JWT protection) — the migration
 * backfills rows for all pre-existing users, and the signup trigger creates
 * one for every new user.
 *
 * Fail-open exception: if the profile QUERY ERRORS (as opposed to cleanly
 * returning zero rows) we log and allow — that is a DB outage or the
 * profiles migration not yet applied, and bricking every page on a
 * transient error is worse than briefly not enforcing trial expiry.
 */

export interface SessionAccess {
  userId: string;
  email: string | null;
  /** null = profile row missing (treated as no access). */
  profile: {
    fullName: string;
    organisation: string;
    accountType: string;
    accessExpiresAt: string | null;
    isAdmin: boolean;
  } | null;
  /** Query failed (outage / migration pending) — access checks fail open. */
  profileUnavailable: boolean;
}

/** One session+profile read per request (React cache). */
export const getSessionAccess = cache(async (): Promise<SessionAccess | null> => {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;

  const { data: row, error } = await supabase
    .from("profiles")
    .select("full_name, organisation, account_type, access_expires_at, is_admin")
    .eq("id", claims.sub)
    .maybeSingle();

  if (error) {
    console.warn(`[access] profile read failed (fail-open): ${error.message}`);
    return {
      userId: claims.sub,
      email: (claims.email as string) ?? null,
      profile: null,
      profileUnavailable: true,
    };
  }
  return {
    userId: claims.sub,
    email: (claims.email as string) ?? null,
    profile: row
      ? {
          fullName: row.full_name,
          organisation: row.organisation,
          accountType: row.account_type,
          accessExpiresAt: row.access_expires_at,
          isAdmin: row.is_admin,
        }
      : null,
    profileUnavailable: false,
  };
});

function hasAccess(s: SessionAccess): boolean {
  if (s.profileUnavailable) return true; // fail-open on outage only
  if (!s.profile) return false; // row missing = no access
  const exp = s.profile.accessExpiresAt;
  return exp === null || new Date(exp).getTime() > Date.now();
}

/**
 * Gate for every protected page's server component: anonymous → landing
 * (with return-to), expired/deleted → /expired. Returns the session for
 * pages that want the email/profile.
 */
export async function requireAccess(currentPath: string): Promise<SessionAccess> {
  const s = await getSessionAccess();
  if (!s) redirect(`/?next=${encodeURIComponent(currentPath)}`);
  if (!hasAccess(s)) redirect("/expired");
  return s;
}

/** Additionally require the admin flag (non-admins land on the home page). */
export async function requireAdmin(currentPath: string): Promise<SessionAccess> {
  const s = await requireAccess(currentPath);
  if (!s.profile?.isAdmin) redirect("/");
  return s;
}
