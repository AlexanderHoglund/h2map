import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { parseScenarioInput } from "@h2map/corridor-schema";
import { jsonError, rateLimited, validationError } from "@/lib/api/responses";
import { checkRateLimit, clientIp, GENERAL_POLICY } from "@/lib/server/rateLimit";
import { getCallerWithAccess, getUserSupabase } from "@/lib/server/userSupabase";
import { insertScenarioRow, parseViewMode } from "@/lib/server/corridorScenarios";

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
 * POST /api/v1/corridor/scenarios  { name, payload, view_mode? }  → created row
 * GET  /api/v1/corridor/scenarios                     → caller's list (light)
 */

export async function POST(request: NextRequest): Promise<Response> {
  const limit = checkRateLimit(`corridor-scn:${clientIp(request)}`, GENERAL_POLICY);
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);

  const supabase = getUserSupabase(request);
  const access = await getCallerWithAccess(supabase);
  if (!access.ok) {
    return access.code === "access_expired"
      ? jsonError(403, "access_expired", "Your access period has ended")
      : jsonError(401, "unauthorized", "Sign-in required");
  }
  const caller = access.caller;

  let name: string;
  let payloadRaw: unknown;
  let viewMode: ReturnType<typeof parseViewMode>;
  try {
    const body = (await request.json()) as {
      name?: unknown;
      payload?: unknown;
      view_mode?: unknown;
    };
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return jsonError(400, "invalid_name", "name must be a non-empty string");
    }
    name = body.name.trim().slice(0, 200);
    payloadRaw = body.payload;
    viewMode = parseViewMode(body.view_mode);
  } catch {
    return jsonError(400, "invalid_json", "Body must be JSON { name, payload }");
  }

  try {
    const payload = parseScenarioInput(payloadRaw);
    // Results computed server-side (the engine is pure and fast) so the stored
    // results always correspond to the stored payload + pinned versions.
    const { data, error } = await insertScenarioRow(
      supabase,
      caller.id,
      name,
      payload,
      viewMode,
    );
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
  const access = await getCallerWithAccess(supabase);
  if (!access.ok) {
    return access.code === "access_expired"
      ? jsonError(403, "access_expired", "Your access period has ended")
      : jsonError(401, "unauthorized", "Sign-in required");
  }


  const COLS =
    "id, name, kind, schema_version, engine_version, ref_bundle_version, share_token, created_at, updated_at";
  const list = (cols: string) =>
    supabase
      .from("scenarios")
      // Cast: generated types predate the 20260811 migration (view_mode).
      .select(cols as "*")
      .eq("kind", "corridor")
      .order("updated_at", { ascending: false });
  let { data, error } = await list(`${COLS}, view_mode`);
  if (error && /view_mode/.test(error.message)) {
    // Migration 20260811 not applied yet — list without the column.
    ({ data, error } = await list(COLS));
  }
  if (error) {
    console.error("[api/corridor/scenarios GET]", error);
    return jsonError(500, "db_error", "Could not list scenarios");
  }
  return Response.json({ scenarios: data });
}
