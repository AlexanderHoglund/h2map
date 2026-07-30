import type { NextRequest } from "next/server";
import { jsonError, rateLimited } from "@/lib/api/responses";
import { checkRateLimit, clientIp, GENERAL_POLICY } from "@/lib/server/rateLimit";
import { getUserSupabase } from "@/lib/server/userSupabase";

/**
 * Read-only shared-scenario access (build-plan 2.2): the share link encodes
 * NOTHING but the token; the payload always comes from the DB row via the
 * existing security-definer RPC (no open SELECT policy — knowing the exact
 * token is the capability). Anonymous access is intended; the response is
 * sanitized (no owner id, no share token echo).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const limit = checkRateLimit(`corridor-share:${clientIp(request)}`, GENERAL_POLICY);
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    return jsonError(400, "invalid_token", "Malformed share token");
  }

  const supabase = getUserSupabase(request); // anon key is enough for the RPC
  const { data, error } = await supabase.rpc("get_scenario_by_share_token", {
    p_token: token,
  });
  if (error) {
    console.error("[api/corridor/s/:token]", error);
    return jsonError(500, "db_error", "Could not load the shared scenario");
  }
  const row = data?.[0];
  if (!row || row.kind !== "corridor") {
    return jsonError(404, "not_found", "No shared scenario for this token");
  }
  return Response.json({
    name: row.name,
    payload: row.inputs,
    results: row.results,
    schemaVersion: row.schema_version,
    engineVersion: row.engine_version,
    refBundleVersion: row.ref_bundle_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}
