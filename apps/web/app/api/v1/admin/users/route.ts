import type { NextRequest } from "next/server";
import { jsonError, rateLimited } from "@/lib/api/responses";
import { requireAdminCaller } from "@/lib/server/adminGuard";
import { checkRateLimit, clientIp, GENERAL_POLICY } from "@/lib/server/rateLimit";
import { getServerSupabase } from "@/lib/server/supabase";

/**
 * Admin: list users (login build).
 *
 *   GET /api/v1/admin/users → [{ id, email, full_name, organisation,
 *     account_type, access_expires_at, is_admin, last_sign_in_at, created_at }]
 *
 * The service-role client runs only AFTER the caller's own user-client
 * profile read proves is_admin (lib/server/adminGuard.ts).
 */
export async function GET(request: NextRequest): Promise<Response> {
  const limit = checkRateLimit(`admin:${clientIp(request)}`, GENERAL_POLICY);
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);

  const guard = await requireAdminCaller(request);
  if (!guard.ok) return guard.res;

  const admin = getServerSupabase();
  const [{ data: authUsers, error: authErr }, { data: profiles, error: profErr }] =
    await Promise.all([
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      admin.from("profiles").select("*"),
    ]);
  if (authErr) return jsonError(500, "internal_error", authErr.message);
  if (profErr) return jsonError(500, "internal_error", profErr.message);

  const byId = new Map(profiles.map((p) => [p.id, p]));
  const users = authUsers.users.map((u) => {
    const p = byId.get(u.id);
    return {
      id: u.id,
      email: u.email ?? null,
      full_name: p?.full_name ?? "",
      organisation: p?.organisation ?? "",
      account_type: p?.account_type ?? "full",
      access_expires_at: p?.access_expires_at ?? null,
      is_admin: p?.is_admin ?? false,
      last_sign_in_at: u.last_sign_in_at ?? null,
      created_at: u.created_at,
    };
  });
  users.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return Response.json(users);
}
