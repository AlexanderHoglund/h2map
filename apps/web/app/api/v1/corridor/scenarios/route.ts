import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { parseScenarioInput, resolveScenario } from "@h2map/corridor-schema";
import { CORRIDOR_ENGINE_VERSION, evaluateScenario } from "@h2map/corridor-engine";
import { jsonError, rateLimited, validationError } from "@/lib/api/responses";
import { checkRateLimit, clientIp, GENERAL_POLICY } from "@/lib/server/rateLimit";
import { getCaller, getUserSupabase } from "@/lib/server/userSupabase";
import { loadRefBundle } from "@/lib/server/corridorRef";

/**
 * Corridor scenario CRUD (build-plan Phase 2.2). All routes run under the
 * CALLER's JWT so the owner-only RLS policy is enforced by Postgres.
 *
 * The payload is validated against the zod schema SERVER-SIDE on every write
 * (never trust the client copy of a pinned-version object), and the version
 * pins (schema_version / engine_version / ref_bundle_version) plus the
 * results are derived server-side — the client cannot write stale or forged
 * versions/results.
 *
 * POST /api/v1/corridor/scenarios  { name, payload }  → created row
 * GET  /api/v1/corridor/scenarios                     → caller's list (light)
 */

export async function POST(request: NextRequest): Promise<Response> {
  const limit = checkRateLimit(`corridor-scn:${clientIp(request)}`, GENERAL_POLICY);
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);

  const supabase = getUserSupabase(request);
  const caller = await getCaller(supabase);
  if (!caller) return jsonError(401, "unauthorized", "Sign-in required");

  let name: string;
  let payloadRaw: unknown;
  try {
    const body = (await request.json()) as { name?: unknown; payload?: unknown };
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return jsonError(400, "invalid_name", "name must be a non-empty string");
    }
    name = body.name.trim().slice(0, 200);
    payloadRaw = body.payload;
  } catch {
    return jsonError(400, "invalid_json", "Body must be JSON { name, payload }");
  }

  try {
    const payload = parseScenarioInput(payloadRaw);
    const bundle = loadRefBundle(payload.refBundleId);
    // Results computed server-side (the engine is pure and fast) so the stored
    // results always correspond to the stored payload + pinned versions.
    const results = evaluateScenario(resolveScenario(payload, bundle));

    const { data, error } = await supabase
      .from("scenarios")
      .insert({
        owner: caller.id,
        name,
        kind: "corridor",
        inputs: JSON.parse(JSON.stringify(payload)),
        results: JSON.parse(JSON.stringify(results)),
        schema_version: payload.schemaVersion,
        engine_version: CORRIDOR_ENGINE_VERSION,
        ref_bundle_version: payload.refBundleId,
      })
      .select()
      .single();
    if (error) {
      console.error("[api/corridor/scenarios POST]", error);
      return jsonError(500, "db_error", "Could not save the scenario");
    }
    return Response.json(data, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    if (err instanceof Error && /bundle/.test(err.message)) {
      return jsonError(422, "unknown_bundle", err.message);
    }
    console.error("[api/corridor/scenarios POST]", err);
    return jsonError(500, "internal_error", "Unexpected error");
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  const limit = checkRateLimit(`corridor-scn:${clientIp(request)}`, GENERAL_POLICY);
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);

  const supabase = getUserSupabase(request);
  const caller = await getCaller(supabase);
  if (!caller) return jsonError(401, "unauthorized", "Sign-in required");

  const { data, error } = await supabase
    .from("scenarios")
    .select(
      "id, name, kind, schema_version, engine_version, ref_bundle_version, share_token, created_at, updated_at",
    )
    .eq("kind", "corridor")
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("[api/corridor/scenarios GET]", error);
    return jsonError(500, "db_error", "Could not list scenarios");
  }
  return Response.json({ scenarios: data });
}
