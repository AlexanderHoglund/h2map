import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { parseScenarioInput, resolveScenario } from "@h2map/corridor-schema";
import { CORRIDOR_ENGINE_VERSION, evaluateScenario } from "@h2map/corridor-engine";
import { jsonError, rateLimited, validationError } from "@/lib/api/responses";
import { checkRateLimit, clientIp, GENERAL_POLICY } from "@/lib/server/rateLimit";
import { getCallerWithAccess, getUserSupabase } from "@/lib/server/userSupabase";
import { loadRefBundle } from "@/lib/server/corridorRef";
import type { TablesUpdate } from "@/lib/supabase/database.types";

/**
 * Single-scenario read/update (owner-only via RLS — a non-owner's query
 * simply matches no row, so cross-owner reads 404 rather than 403-leak).
 *
 * GET /api/v1/corridor/scenarios/:id
 * PUT /api/v1/corridor/scenarios/:id  { name?, payload?, share? }
 *   - payload: re-validated server-side; results + version pins recomputed.
 *   - share: true generates an unguessable token (once); false revokes it.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const limit = checkRateLimit(`corridor-scn:${clientIp(request)}`, GENERAL_POLICY);
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);
  const { id } = await params;
  if (!UUID_RE.test(id)) return jsonError(400, "invalid_id", "id must be a UUID");

  const supabase = getUserSupabase(request);
  const access = await getCallerWithAccess(supabase);
  if (!access.ok) {
    return access.code === "access_expired"
      ? jsonError(403, "access_expired", "Your access period has ended")
      : jsonError(401, "unauthorized", "Sign-in required");
  }


  const { data, error } = await supabase
    .from("scenarios")
    .select()
    .eq("id", id)
    .eq("kind", "corridor")
    .maybeSingle();
  if (error) {
    console.error("[api/corridor/scenarios/:id GET]", error);
    return jsonError(500, "db_error", "Could not load the scenario");
  }
  if (!data) return jsonError(404, "not_found", "No such scenario (or not yours)");
  return Response.json(data);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const limit = checkRateLimit(`corridor-scn:${clientIp(request)}`, GENERAL_POLICY);
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);
  const { id } = await params;
  if (!UUID_RE.test(id)) return jsonError(400, "invalid_id", "id must be a UUID");

  const supabase = getUserSupabase(request);
  const access = await getCallerWithAccess(supabase);
  if (!access.ok) {
    return access.code === "access_expired"
      ? jsonError(403, "access_expired", "Your access period has ended")
      : jsonError(401, "unauthorized", "Sign-in required");
  }


  let body: { name?: unknown; payload?: unknown; share?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError(400, "invalid_json", "Body must be JSON");
  }

  const patch: TablesUpdate<"scenarios"> = {};
  try {
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim().length === 0) {
        return jsonError(400, "invalid_name", "name must be a non-empty string");
      }
      patch.name = body.name.trim().slice(0, 200);
    }
    if (body.payload !== undefined) {
      const payload = parseScenarioInput(body.payload);
      const bundle = loadRefBundle(payload.refBundleId);
      const results = evaluateScenario(resolveScenario(payload, bundle));
      patch.inputs = JSON.parse(JSON.stringify(payload));
      patch.results = JSON.parse(JSON.stringify(results));
      patch.schema_version = payload.schemaVersion;
      patch.engine_version = CORRIDOR_ENGINE_VERSION;
      patch.ref_bundle_version = payload.refBundleId;
    }
    if (body.share === true) {
      // 24 random bytes, base64url — unguessable; share links carry ONLY this.
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      patch.share_token = Buffer.from(bytes).toString("base64url");
    } else if (body.share === false) {
      patch.share_token = null;
    }
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    if (err instanceof Error && /bundle/.test(err.message)) {
      return jsonError(422, "unknown_bundle", err.message);
    }
    throw err;
  }
  if (Object.keys(patch).length === 0) {
    return jsonError(400, "empty_patch", "Nothing to update");
  }

  const { data, error } = await supabase
    .from("scenarios")
    .update(patch)
    .eq("id", id)
    .eq("kind", "corridor")
    .select()
    .maybeSingle();
  if (error) {
    console.error("[api/corridor/scenarios/:id PUT]", error);
    return jsonError(500, "db_error", "Could not update the scenario");
  }
  if (!data) return jsonError(404, "not_found", "No such scenario (or not yours)");
  return Response.json(data);
}

/**
 * Delete a scenario (login build). RLS scopes the delete to the caller's own
 * rows; cross-owner and absent ids both come back 404 (the same anti-leak
 * convention as GET/PUT — a 403 would confirm existence).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const limit = checkRateLimit(`corridor-scn:${clientIp(request)}`, GENERAL_POLICY);
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);
  const { id } = await params;
  if (!UUID_RE.test(id)) return jsonError(404, "not_found", "No such scenario");

  const supabase = getUserSupabase(request);
  const access = await getCallerWithAccess(supabase);
  if (!access.ok) {
    return access.code === "access_expired"
      ? jsonError(403, "access_expired", "Your access period has ended")
      : jsonError(401, "unauthorized", "Sign-in required");
  }

  const { data, error } = await supabase
    .from("scenarios")
    .delete()
    .eq("id", id)
    .eq("kind", "corridor")
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[api/corridor/scenarios/:id DELETE]", error);
    return jsonError(500, "db_error", "Could not delete the scenario");
  }
  if (!data) return jsonError(404, "not_found", "No such scenario (or not yours)");
  return Response.json({ deleted: data.id });
}
