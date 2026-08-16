import type { NextRequest } from "next/server";
import { jsonError, rateLimited } from "@/lib/api/responses";
import { checkRateLimit, clientIp, GENERAL_POLICY } from "@/lib/server/rateLimit";
import { getCallerWithAccess, getUserSupabase } from "@/lib/server/userSupabase";
import { getServerSupabase } from "@/lib/server/supabase";
import { insertScenarioRow } from "@/lib/server/corridorScenarios";
import {
  defaultScenario,
  emptyScenario,
  modernChileScenario,
} from "@/lib/corridor/scenarioDefaults";

/**
 * Starter-project seeding (projects-first UX, 2026-08-11; template rework
 * 2026-08-13; second Chilean example 2026-08-16): every user gets TWO
 * STANDARD Chilean examples (once per user, ever — deleted, they never
 * come back) plus the SIMPLIFIED template "Simple corridor (template)",
 * which is ENSURED BY NAME on every seed call — existing users gain it on
 * their next visit, and deleting it just brings the template back (it is a
 * template, not a document).
 *
 * The two examples are the same published corridor under different
 * treatments: one reproduces the MMMCZCS study by asserting its published
 * burns and fleet costs, the other releases those overrides and lets the
 * current model derive them. Both are documents, so both are gated by the
 * once-ever stamp together.
 *
 * POST /api/v1/corridor/scenarios/seed → 201 { seeded: true, scenarios }
 *                                       | 204 (nothing to do)
 *
 * The example's once-ever is enforced race-safely: the service client
 * stamps profiles.projects_seeded_at with a conditional update (… where
 * projects_seeded_at is null) BEFORE inserting; a concurrent call matches
 * zero rows. profiles keeps no authenticated write policy — the flag is
 * server-set only. Without the 20260811 migration (no flag column) the
 * example falls back to the seed-when-list-empty rule; the template's
 * ensure-by-name works either way.
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

  const SIMPLE_TEMPLATE_NAME = "Simple corridor (template)";
  const MODERN_EXAMPLE_NAME = "Chilean copper corridor — current model";
  const created: unknown[] = [];

  const service = getServerSupabase();
  // Cast: generated types predate the 20260811 migration (projects_seeded_at).
  const { data: stamped, error: stampError } = await service
    .from("profiles")
    .update({ projects_seeded_at: new Date().toISOString() } as never)
    .eq("id", caller.id)
    .is("projects_seeded_at" as never, null)
    .select("id");
  let seedExample: boolean;
  if (stampError) {
    // Migration 20260811 not applied (or service key absent): fall back to
    // the weaker "seed when the project list is empty" rule for the
    // example — checked BEFORE the template insert below so a brand-new
    // user still gets it.
    console.warn(
      "[api/corridor/scenarios/seed] no seed flag, falling back to empty-list rule:",
      stampError.message,
    );
    const { count, error: countError } = await supabase
      .from("scenarios")
      .select("id", { count: "exact", head: true })
      .eq("kind", "corridor");
    seedExample = !countError && (count ?? 0) === 0;
  } else {
    seedExample = (stamped?.length ?? 0) > 0;
  }

  // Inserts run under the CALLER's JWT (RLS-scoped, owner = caller), exactly
  // like a manual save.
  if (seedExample) {
    const example = await insertScenarioRow(
      supabase,
      caller.id,
      "Example — Chilean copper corridor",
      defaultScenario(),
      "standard",
    );
    if (example.error) {
      console.error("[api/corridor/scenarios/seed]", example.error);
      return jsonError(500, "db_error", "Could not create the starter projects");
    }
    created.push(example.data);

    // The same corridor with the overrides released, so the two sit side by
    // side: one reproduces the study by asserting its answers, the other
    // derives what the current model can and lands within ~4% of it.
    //
    // Named so it CANNOT be a superstring of the example above — the e2e
    // suite selects that row by regex with .first(), which a longer name
    // containing it would match non-deterministically.
    const modern = await insertScenarioRow(
      supabase,
      caller.id,
      MODERN_EXAMPLE_NAME,
      modernChileScenario(),
      "standard",
    );
    if (modern.error) {
      console.error("[api/corridor/scenarios/seed]", modern.error);
      return jsonError(500, "db_error", "Could not create the starter projects");
    }
    created.push(modern.data);
  }

  // The Simplified template is ensured for EVERY user, by name.
  const { data: tmpl, error: tmplLookupError } = await supabase
    .from("scenarios")
    .select("id")
    .eq("kind", "corridor")
    .eq("name", SIMPLE_TEMPLATE_NAME)
    .limit(1);
  if (!tmplLookupError && (tmpl?.length ?? 0) === 0) {
    const template = await insertScenarioRow(
      supabase,
      caller.id,
      SIMPLE_TEMPLATE_NAME,
      emptyScenario(),
      "simplified",
    );
    if (template.error) {
      console.error("[api/corridor/scenarios/seed]", template.error);
      return jsonError(500, "db_error", "Could not create the starter projects");
    }
    created.push(template.data);
  }

  if (created.length === 0) return new Response(null, { status: 204 });
  return Response.json({ seeded: true, scenarios: created }, { status: 201 });
}
