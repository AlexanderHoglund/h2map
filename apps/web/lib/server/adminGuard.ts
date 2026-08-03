import { jsonError } from "@/lib/api/responses";
import { getCaller, getUserSupabase } from "@/lib/server/userSupabase";

/**
 * Admin-API guard (login build): the caller is verified as an admin through
 * their OWN user-client profile read (RLS self-select + the is_admin flag no
 * user can write) — only after this passes may a route touch the
 * service-role client. Keeps the service role from ever acting on an
 * unverified caller's behalf.
 */
export async function requireAdminCaller(
  request: Request,
): Promise<{ ok: true; callerId: string } | { ok: false; res: Response }> {
  const supabase = getUserSupabase(request);
  const caller = await getCaller(supabase);
  if (!caller) {
    return { ok: false, res: jsonError(401, "unauthorized", "Sign-in required") };
  }
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", caller.id)
    .maybeSingle();
  if (error || !profile?.is_admin) {
    return { ok: false, res: jsonError(403, "forbidden", "Admin access required") };
  }
  return { ok: true, callerId: caller.id };
}
