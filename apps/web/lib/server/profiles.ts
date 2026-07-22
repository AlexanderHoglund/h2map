import {
  getResourceProfile,
  type ProfileKind,
  type ResourceProfileResult,
} from "@h2map/profile-service";
import { fetchJsonWithRetry } from "./fetchJson";
import { SupabaseProfileCache } from "./profileCache";
import { getServerSupabase } from "./supabase";
import { getGenericTurbineCurve } from "./turbine";

/** Resolve a resource profile with the production dependency wiring. */
export function resolveResourceProfile(
  lat: number,
  lon: number,
  kind: ProfileKind,
): Promise<ResourceProfileResult> {
  return getResourceProfile(
    { lat, lon, kind },
    {
      fetchJson: fetchJsonWithRetry,
      cache: new SupabaseProfileCache(getServerSupabase()),
      getTurbineCurve: getGenericTurbineCurve,
      log: (message) => console.warn(`[profiles] ${message}`),
    },
  );
}
