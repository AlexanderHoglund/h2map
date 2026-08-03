import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, rateLimited, validationError } from "@/lib/api/responses";
import { requireAdminCaller } from "@/lib/server/adminGuard";
import { checkRateLimit, clientIp, GENERAL_POLICY } from "@/lib/server/rateLimit";
import { getServerSupabase } from "@/lib/server/supabase";

/**
 * Admin: manage one user (login build).
 *
 *   PATCH  { account_type? } | { access_expires_at?: ISO|null } |
 *          { extendDays: 30 }              → updated profile fields
 *   DELETE                                  → deletes the auth user;
 *          profiles + scenarios rows cascade. Self-delete refused.
 *
 * "+30 days" extends from now or the current expiry, whichever is later;
 * a past access_expires_at is the "expire now" lever.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const patchSchema = z
  .object({
    account_type: z.enum(["full", "trial", "teaching"]).optional(),
    access_expires_at: z.string().datetime({ offset: true }).nullable().optional(),
    extendDays: z.number().int().min(1).max(3650).optional(),
  })
  .refine(
    (b) =>
      b.account_type !== undefined ||
      b.access_expires_at !== undefined ||
      b.extendDays !== undefined,
    { message: "empty patch" },
  )
  .refine((b) => !(b.access_expires_at !== undefined && b.extendDays !== undefined), {
    message: "access_expires_at and extendDays are mutually exclusive",
  });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const limit = checkRateLimit(`admin:${clientIp(request)}`, GENERAL_POLICY);
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);
  const { id } = await params;
  if (!UUID_RE.test(id)) return jsonError(400, "invalid_id", "Not a user id");

  const guard = await requireAdminCaller(request);
  if (!guard.ok) return guard.res;

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) return validationError(err);
    return jsonError(400, "invalid_json", "Body must be JSON");
  }

  const admin = getServerSupabase();
  const patch: { account_type?: string; access_expires_at?: string | null } = {};
  if (body.account_type !== undefined) patch.account_type = body.account_type;
  if (body.access_expires_at !== undefined) {
    patch.access_expires_at = body.access_expires_at;
  }
  if (body.extendDays !== undefined) {
    const { data: current, error } = await admin
      .from("profiles")
      .select("access_expires_at")
      .eq("id", id)
      .maybeSingle();
    if (error) return jsonError(500, "internal_error", error.message);
    if (!current) return jsonError(404, "not_found", "No such user");
    const base = Math.max(
      Date.now(),
      current.access_expires_at ? new Date(current.access_expires_at).getTime() : 0,
    );
    patch.access_expires_at = new Date(
      base + body.extendDays * 86_400_000,
    ).toISOString();
  }

  const { data: updated, error: updErr } = await admin
    .from("profiles")
    .update(patch)
    .eq("id", id)
    .select("id, account_type, access_expires_at, is_admin")
    .maybeSingle();
  if (updErr) return jsonError(500, "internal_error", updErr.message);
  if (!updated) return jsonError(404, "not_found", "No such user");
  return Response.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const limit = checkRateLimit(`admin:${clientIp(request)}`, GENERAL_POLICY);
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);
  const { id } = await params;
  if (!UUID_RE.test(id)) return jsonError(400, "invalid_id", "Not a user id");

  const guard = await requireAdminCaller(request);
  if (!guard.ok) return guard.res;
  if (id === guard.callerId) {
    return jsonError(400, "cannot_delete_self", "You cannot delete your own account");
  }

  const admin = getServerSupabase();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    const notFound = /not.*found/i.test(error.message);
    return notFound
      ? jsonError(404, "not_found", "No such user")
      : jsonError(500, "internal_error", error.message);
  }
  // profiles + scenarios rows cascade via FK.
  return Response.json({ deleted: id });
}
