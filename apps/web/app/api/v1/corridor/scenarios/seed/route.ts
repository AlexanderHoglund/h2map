import type { NextRequest } from "next/server";
import { jsonError, rateLimited } from "@/lib/api/responses";
import { checkRateLimit, clientIp, GENERAL_POLICY } from "@/lib/server/rateLimit";
import { getCallerWithAccess, getUserSupabase } from "@/lib/server/userSupabase";
import { getServerSupabase } from "@/lib/server/supabase";
import { insertScenarioRow } from "@/lib/server/corridorScenarios";
import { defaultScenario, emptyScenario } from "@/lib/corridor/scenarioDefaults";

/**
 * Starter-project seeding (projects-first UX, 2026-08-11): every user gets
 * the Chilean example plus an empty Simplified starter — ONCE per user,
 * ever (user decision: deleted starters never come back).
 *
 * POST /api/v1/corridor/scenarios/seed → 201 { seeded: true, scenarios }
 *                                       | 204 (already seeded)
 *
 * Once-ever is enforced race-safely: the service client stamps
 * profiles.projects_seeded_at with a conditional update (… where
 * projects_seeded_at is null) BEFORE inserting; a concurrent call matches
 * zero rows and returns 204. profiles keeps no authenticated write policy —
 * the flag is server-set only. If the 20260811 migration is not applied yet
 * (no flag column), seeding is SKIPPED (never un-gated), fail-soft 204.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const limit = checkRateLimit(`corridor-seed:${clientIp(request)}`, GENERAL_POLICY);
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);

  const supabase = getUserSupabase(request);
  const access = await getCallerWithAccess(supabase);
  if (!access.ok) {
    return access.code === "access_expired"
      ? jsonError(403, "access_expired", "Your access period has ended")
      : jsonError(401, "unauthorized", "Sign-in required");
  }
  const caller = access.caller;

  const service = getServerSupabase();
  // Cast: generated types predate the 20260811 migration (projects_seeded_at).
  const { data: stamped, error: stampError } = await service
    .from("profiles")
    .update({ projects_seeded_at: new Date().toISOString() } as never)
    .eq("id", caller.id)
    .is("projects_seeded_at" as never, null)
    .select("id");
  if (stampError) {
    // Migration 20260811 not applied (or service key absent): fall back to
    // the weaker "seed when the project list is empty" rule — starters can
    // reappear after a full wipe until the flag column exists, then the
    // once-ever guarantee takes over.
    console.warn(
      "[api/corridor/scenarios/seed] no seed flag, falling back to empty-list rule:",
      stampError.message,
    );
    const { count, error: countError } = await supabase
      .from("scenarios")
      .select("id", { count: "exact", head: true })
      .eq("kind", "corridor");
    if (countError || (count ?? 0) > 0) {
      return new Response(null, { status: 204 });
    }
  } else if (!stamped || stamped.length === 0) {
    return new Response(null, { status: 204 }); // already seeded
  }

  // Inserts run under the CALLER's JWT (RLS-scoped, owner = caller), exactly
  // like a manual save.
  const example = await insertScenarioRow(
    supabase,
    caller.id,
    "Example — Chilean copper corridor",
    defaultScenario(),
    "standard",
  );
  const starter = await insertScenarioRow(
    supabase,
    caller.id,
    "My first corridor",
    emptyScenario(),
    "simplified",
  );
  if (example.error || starter.error) {
    console.error(
      "[api/corridor/scenarios/seed]",
      example.error ?? starter.error,
    );
    return jsonError(500, "db_error", "Could not create the starter projects");
  }
  return Response.json(
    { seeded: true, scenarios: [example.data, starter.data] },
    { status: 201 },
  );
}
