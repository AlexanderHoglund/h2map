import type {
  BuiltProfile,
  CachedProfile,
  ProfileCache,
  ProfileKind,
  ProfileMode,
} from "@h2map/profile-service";
import type { ServerSupabase } from "./supabase";

/**
 * `resource_profiles` cache adapter. Writes require the service-role key
 * (the table intentionally has no RLS insert policy) — with the anon key
 * they fail and the service continues uncached.
 *
 * Reads take the newest row for (coordinate, kind, mode) that the caller's
 * `accept` predicate recognises as the CURRENT model generation. Rows are
 * keyed on `dataset_version`, so a coordinate accumulates one row per
 * generation; taking the newest unconditionally served profiles built under
 * superseded models (e.g. the pre-fix PV mounting) forever, and put one map
 * on two incompatible models at once.
 */
const GENERATION_SCAN_LIMIT = 4;

export class SupabaseProfileCache implements ProfileCache {
  constructor(private readonly db: ServerSupabase) {}

  async get(
    latR: number,
    lonR: number,
    kind: ProfileKind,
    mode?: ProfileMode,
    accept?: (datasetVersion: string, provider: string) => boolean,
  ): Promise<CachedProfile | null> {
    let query = this.db
      .from("resource_profiles")
      .select("lat_r, lon_r, kind, provider, dataset_version, cf")
      .eq("lat_r", latR)
      .eq("lon_r", lonR)
      .eq("kind", kind);
    if (mode) query = query.eq("mode", mode);
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(GENERATION_SCAN_LIMIT);
    if (error) throw new Error(`resource_profiles read: ${error.message}`);
    const row = (data ?? []).find(
      (r) => !accept || accept(r.dataset_version, r.provider),
    );
    if (!row) return null;
    return {
      latR: Number(row.lat_r),
      lonR: Number(row.lon_r),
      kind: row.kind as ProfileKind,
      provider: row.provider,
      datasetVersion: row.dataset_version,
      cf: row.cf,
    };
  }

  async put(profile: BuiltProfile): Promise<void> {
    const { error } = await this.db.from("resource_profiles").upsert(
      {
        lat_r: profile.latR,
        lon_r: profile.lonR,
        kind: profile.kind,
        mode: profile.mode,
        provider: profile.provider,
        dataset_version: profile.datasetVersion,
        years: `[${profile.yearsUsed[0]},${profile.yearsUsed[1]}]`,
        cf: profile.cf,
      },
      // Must match the table's unique key exactly (migration
      // 20260729000001 added `mode`): omitting it made improved and
      // reference rows collide on one slot and thrash.
      { onConflict: "lat_r,lon_r,kind,mode,dataset_version" },
    );
    if (error) throw new Error(`resource_profiles write: ${error.message}`);
  }
}
