import type {
  BuiltProfile,
  CachedProfile,
  ProfileCache,
  ProfileKind,
} from "@h2map/profile-service";
import type { ServerSupabase } from "./supabase";

/**
 * `resource_profiles` cache adapter. Reads pick the newest row for the
 * coordinate/kind regardless of dataset version; writes upsert on the unique
 * (lat_r, lon_r, kind, dataset_version) key. Writes require the service-role
 * key (the table intentionally has no RLS insert policy) — with the anon key
 * they fail and the service continues uncached.
 */
export class SupabaseProfileCache implements ProfileCache {
  constructor(private readonly db: ServerSupabase) {}

  async get(
    latR: number,
    lonR: number,
    kind: ProfileKind,
  ): Promise<CachedProfile | null> {
    const { data, error } = await this.db
      .from("resource_profiles")
      .select("lat_r, lon_r, kind, provider, dataset_version, cf")
      .eq("lat_r", latR)
      .eq("lon_r", lonR)
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`resource_profiles read: ${error.message}`);
    if (!data) return null;
    return {
      latR: Number(data.lat_r),
      lonR: Number(data.lon_r),
      kind: data.kind as ProfileKind,
      provider: data.provider,
      datasetVersion: data.dataset_version,
      cf: data.cf,
    };
  }

  async put(profile: BuiltProfile): Promise<void> {
    const { error } = await this.db.from("resource_profiles").upsert(
      {
        lat_r: profile.latR,
        lon_r: profile.lonR,
        kind: profile.kind,
        provider: profile.provider,
        dataset_version: profile.datasetVersion,
        years: `[${profile.yearsUsed[0]},${profile.yearsUsed[1]}]`,
        cf: profile.cf,
      },
      { onConflict: "lat_r,lon_r,kind,dataset_version" },
    );
    if (error) throw new Error(`resource_profiles write: ${error.message}`);
  }
}
