import type { NextRequest } from "next/server";
import { jsonError, rateLimited } from "@/lib/api/responses";
import { checkRateLimit, clientIp, GENERAL_POLICY } from "@/lib/server/rateLimit";
import { getCallerWithAccess, getUserSupabase } from "@/lib/server/userSupabase";
import { getServerSupabase } from "@/lib/server/supabase";
import type { ScenarioInput } from "@h2map/corridor-schema";
import type { ProjectViewMode } from "@/lib/server/corridorScenarios";
import { insertScenarioRow } from "@/lib/server/corridorScenarios";
import {
  benchmarkChileScenario,
  defaultScenario,
  emptyScenario,
  modernChileScenario,
  studyChileScenario,
} from "@/lib/corridor/scenarioDefaults";

/**
 * Starter-project seeding (projects-first UX, 2026-08-11; template rework
 * 2026-08-13; further Chilean examples 2026-08-16): every user gets FOUR
 * STANDARD Chilean examples plus the SIMPLIFIED template "Simple corridor
 * (template)".
 *
 * The four examples are the SAME published corridor under four treatments,
 * ordered by how much study knowledge each asserts. Reading them side by
 * side is the point:
 *
 *   "… — as published"     27 overrides. The report's own accounting;
 *                          reproduces all six published figures within 1.7%.
 *   "Example — …"          21 overrides. The shipped default: the study's
 *                          asserted burns and costs, refined emission method.
 *   "… — current model"    17 overrides. Burns and fleet cost released, so
 *                          the model derives them and is then scored.
 *   "… — benchmarks only"  ZERO overrides. Every figure a bundle benchmark
 *                          or derived from the route.
 *
 * None is "the right answer" alone. The first says what the report said;
 * the last says what the model's generic reference data says about the same
 * route, and lands 83% lower — almost entirely because the benchmark plant
 * is 5% of the study's Atacama facility. The SPREAD is the useful output,
 * not any single number in it.
 *
 * They are gated DIFFERENTLY, and the reason matters. The original example
 * rides the once-ever stamp. The second was added later, by which point
 * most accounts were already stamped — putting it behind the same gate
 * would have shipped it to nobody but brand-new users. It is ensured by
 * name instead, so existing users pick it up on their next visit.
 * Anything added to the starter set from here on wants the same treatment.
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
  const STUDY_EXAMPLE_NAME = "Chilean copper corridor — as published";
  const BENCHMARK_EXAMPLE_NAME = "Chilean copper corridor — benchmarks only";
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
  }

  /**
   * Create a row only if this user has none by that name.
   *
   * Used for anything added to the starter set AFTER a user's once-ever
   * stamp was already written: the `seedExample` branch above can never run
   * again for an existing account, so a new starter placed inside it would
   * reach nobody but brand-new users. Ensure-by-name reaches everyone on
   * their next visit, and re-creates the row if it is deleted.
   */
  const ensureByName = async (
    name: string,
    payload: ScenarioInput,
    viewMode: ProjectViewMode,
  ): Promise<{ error: { message: string } | null }> => {
    const { data, error: lookupError } = await supabase
      .from("scenarios")
      .select("id")
      .eq("kind", "corridor")
      .eq("name", name)
      .limit(1);
    // A failed lookup must NOT be read as "absent" — that would insert a
    // duplicate on every seed call.
    if (lookupError || (data?.length ?? 0) > 0) return { error: null };
    const row = await insertScenarioRow(supabase, caller.id, name, payload, viewMode);
    if (row.error) return { error: row.error };
    created.push(row.data);
    return { error: null };
  };

  // The same corridor with the study's asserted burns and fleet costs
  // released, so the two examples sit side by side. Ensured by name rather
  // than gated on the once-ever stamp: it was added after most accounts were
  // already stamped, and those users would otherwise never see it.
  //
  // Named so it CANNOT be a superstring of the example above — the e2e suite
  // selects that row by regex with .first(), which a longer name containing
  // it would match non-deterministically.
  const modern = await ensureByName(
    MODERN_EXAMPLE_NAME,
    modernChileScenario(),
    "standard",
  );
  if (modern.error) {
    console.error("[api/corridor/scenarios/seed]", modern.error);
    return jsonError(500, "db_error", "Could not create the starter projects");
  }

  // The same corridor again, on the REPORT's own emission accounting, so
  // every published figure comes back (all six within 1.7%). It answers
  // "what did the report say?" rather than "what does the model think?" —
  // a different question, and the pair of examples is the honest way to
  // show that the answers differ and why.
  const study = await ensureByName(
    STUDY_EXAMPLE_NAME,
    studyChileScenario(),
    "standard",
  );
  if (study.error) {
    console.error("[api/corridor/scenarios/seed]", study.error);
    return jsonError(500, "db_error", "Could not create the starter projects");
  }

  // The same corridor with NOTHING asserted — every figure a bundle
  // benchmark or derived from the route. It lands 83% below the study, and
  // that divergence is the point: it measures how far the model's generic
  // reference data sits from a real corridor-scale project.
  const benchmark = await ensureByName(
    BENCHMARK_EXAMPLE_NAME,
    benchmarkChileScenario(),
    "standard",
  );
  if (benchmark.error) {
    console.error("[api/corridor/scenarios/seed]", benchmark.error);
    return jsonError(500, "db_error", "Could not create the starter projects");
  }

  // The Simplified template is ensured for EVERY user, by name.
  const template = await ensureByName(
    SIMPLE_TEMPLATE_NAME,
    emptyScenario(),
    "simplified",
  );
  if (template.error) {
    console.error("[api/corridor/scenarios/seed]", template.error);
    return jsonError(500, "db_error", "Could not create the starter projects");
  }

  if (created.length === 0) return new Response(null, { status: 204 });
  return Response.json({ seeded: true, scenarios: created }, { status: 201 });
}
