import type { ScenarioInput } from "@h2map/corridor-schema";
import { resolveScenario } from "@h2map/corridor-schema";
import { CORRIDOR_ENGINE_VERSION, evaluateScenario } from "@h2map/corridor-engine";
import { loadRefBundle } from "@/lib/server/corridorRef";
import type { ServerSupabase } from "@/lib/server/supabase";
import type { getUserSupabase } from "@/lib/server/userSupabase";

export type ProjectViewMode = "simplified" | "standard";

export function parseViewMode(value: unknown): ProjectViewMode | undefined {
  return value === "simplified" || value === "standard" ? value : undefined;
}

type AnySupabase = ReturnType<typeof getUserSupabase> | ServerSupabase;

/**
 * Compute results + insert one corridor scenario row (shared by the POST
 * route and the starter seeder). Results and version pins are derived
 * server-side, never trusted from the client.
 *
 * `view_mode` is written when provided; if the column does not exist yet
 * (the 20260811 migration not applied), the insert is retried WITHOUT it so
 * the feature degrades to the browser preference instead of failing.
 */
export async function insertScenarioRow(
  supabase: AnySupabase,
  ownerId: string,
  name: string,
  payload: ScenarioInput,
  viewMode?: ProjectViewMode,
): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> {
  const bundle = loadRefBundle(payload.refBundleId);
  const results = evaluateScenario(resolveScenario(payload, bundle));

  const base = {
    owner: ownerId,
    name,
    kind: "corridor",
    inputs: JSON.parse(JSON.stringify(payload)) as never,
    results: JSON.parse(JSON.stringify(results)) as never,
    schema_version: payload.schemaVersion,
    engine_version: CORRIDOR_ENGINE_VERSION,
    ref_bundle_version: payload.refBundleId,
  };

  // Cast: the generated database.types predate the 20260811 migration
  // (view_mode) — regenerated after the operator applies it.
  const insert = (row: typeof base & { view_mode?: string }) =>
    supabase.from("scenarios").insert(row as never).select().single();

  if (viewMode) {
    const first = await insert({ ...base, view_mode: viewMode });
    if (!first.error || !/view_mode/.test(first.error.message)) {
      return first as never;
    }
    console.warn(
      "[corridorScenarios] view_mode column missing (migration 20260811 not applied) — inserting without it",
    );
  }
  return (await insert(base)) as never;
}
