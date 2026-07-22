import type { TurbineCurve } from "@h2map/profile-service";
import { getServerSupabase } from "./supabase";

const GENERIC_TURBINE_ID = "generic-5.6MW";

let cachedCurve: Promise<TurbineCurve> | null = null;

/**
 * The generic turbine curve from `turbine_curves` (seeded; source of truth
 * mirrored in data/turbines/generic-5.6MW.json). Cached for the process
 * lifetime — reference data changes only via migrations.
 */
export function getGenericTurbineCurve(): Promise<TurbineCurve> {
  cachedCurve ??= loadCurve().catch((err) => {
    cachedCurve = null; // allow retry on the next request
    throw err;
  });
  return cachedCurve;
}

async function loadCurve(): Promise<TurbineCurve> {
  const { data, error } = await getServerSupabase()
    .from("turbine_curves")
    .select("id, rated_kw, speeds, power_kw")
    .eq("id", GENERIC_TURBINE_ID)
    .single();
  if (error) {
    throw new Error(`turbine_curves read (${GENERIC_TURBINE_ID}): ${error.message}`);
  }
  return {
    id: data.id,
    ratedKw: data.rated_kw,
    speedsMs: data.speeds,
    powerKw: data.power_kw,
  };
}
