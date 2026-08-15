/**
 * Public types of the profile service.
 *
 * The service turns (lat, lon, kind) into a cached 8760-hour capacity-factor
 * profile built as a TMY from ~a decade of provider data. Everything with a
 * side effect (HTTP, cache storage) is injected so the package stays
 * dependency-free and unit-testable.
 */

/** Profile configurations, mirroring the `resource_profiles.kind` DB check. */
export type ProfileKind =
  | "pv_fixed"
  | "pv_1axis"
  | "pv_2axis"
  | "wind_120"
  | "wind_160";

export const PROFILE_KINDS: readonly ProfileKind[] = [
  "pv_fixed",
  "pv_1axis",
  "pv_2axis",
  "wind_120",
  "wind_160",
];

/**
 * Which flag-set a profile was built under. `reference` = doc-literal (the
 * parity baseline); `improved` = the P0 #1/#2/#4 corrected profiles the live
 * map serves. Both coexist per coordinate in the cache; the mode is derived
 * from the request's improved flags and used to fetch the matching row.
 */
export type ProfileMode = "reference" | "improved";

/** Digitized turbine power curve (matches the `turbine_curves` table shape). */
export interface TurbineCurve {
  id: string;
  ratedKw: number;
  /** Ascending sample speeds, m/s. Below the first or above the last sample the turbine produces 0. */
  speedsMs: readonly number[];
  powerKw: readonly number[];
}

/** One calendar year of hourly capacity factors, leap-trimmed to 8760. Null = provider gap. */
export interface YearSeries {
  year: number;
  cf: readonly (number | null)[];
}

/** Raw multi-year output of one provider, before gap-filling and TMY selection. */
export interface ProviderResult {
  provider: string;
  /** Identifies source + dataset + year span, e.g. "om-era5-2015-2024". */
  datasetTag: string;
  attribution: string;
  series: YearSeries[];
  notes?: string[];
}

export interface BuiltProfile {
  latR: number;
  lonR: number;
  kind: ProfileKind;
  mode: ProfileMode;
  provider: string;
  /** `${datasetTag}/tmy-v1` — also the cache key component. */
  datasetVersion: string;
  /** Inclusive year span the TMY months were selected from. */
  yearsUsed: [number, number];
  /** Exactly 8760 values in [0, 1]. */
  cf: number[];
  meta: {
    /** Which source year each of the 12 TMY months came from. */
    selectedYearByMonth: number[];
    /** Total provider gap hours that were interpolated, summed over used years. */
    gapHours: number;
    attribution: string;
    notes: string[];
  };
}

export interface CachedProfile {
  latR: number;
  lonR: number;
  kind: ProfileKind;
  provider: string;
  datasetVersion: string;
  cf: number[];
}

/**
 * Cache port. `get` returns the newest profile for the coordinate/kind in the
 * requested `mode` (reference vs improved coexist per coordinate); omit `mode`
 * for the legacy newest-of-any-version behavior. `put` persists a freshly
 * built profile. Both are allowed to fail soft — the service treats the cache
 * as best-effort.
 */
export interface ProfileCache {
  /**
   * `accept` (when supplied) is the CURRENT-generation predicate: the cache
   * must not return a row whose `datasetVersion` fails it. The store keys
   * rows on `dataset_version`, so without this a row built under a
   * superseded generation — a different PV mounting rule, a different
   * provider, a different year span — is served forever, and one map ends
   * up mixing incompatible models. The caller owns the rule because only
   * it knows what the current generation is for this request.
   */
  get(
    latR: number,
    lonR: number,
    kind: ProfileKind,
    mode?: ProfileMode,
    accept?: (datasetVersion: string, provider: string) => boolean,
  ): Promise<CachedProfile | null>;
  put(profile: BuiltProfile): Promise<void>;
}

/** Minimal JSON-GET port (retry/backoff lives behind it, on the app side). */
export type FetchJson = (url: string) => Promise<unknown>;

export interface ProfileServiceDeps {
  fetchJson: FetchJson;
  cache?: ProfileCache;
  /** Required for wind kinds; unused for PV. */
  getTurbineCurve?: () => Promise<TurbineCurve>;
  log?: (message: string) => void;
  /**
   * Normalise wind to the turbine curve's reference air density (IEC
   * 61400-12). Off by default; produces a distinct dataset version so
   * corrected profiles never collide with reference ones in the cache.
   */
  windAirDensityCorrection?: boolean;
  /**
   * Select the IEC wind class from the site's mean hub-height speed and use
   * that class's curve instead of the single reference curve (see
   * turbineClasses). Off by default; produces a distinct dataset version.
   */
  windTurbineClassSelection?: boolean;
  /**
   * PV: serve exclusively from auto-resolved PVGIS (SARAH3 / NSRDB / ERA5 as
   * PVGIS itself chooses per cell) and drop the crude Open-Meteo GHI proxy — a
   * cell PVGIS can't serve renders no-data instead of a differently-modelled,
   * non-comparable value. One consistent, tilt-aware PV model everywhere with no
   * coverage-edge seam. Off by default → PVGIS auto-resolves with the crude
   * proxy as fallback (reference / calculator behavior).
   */
  pvMaskUnservable?: boolean;
  /**
   * Enforce the T1.1 profile-validation gate: a built (or cached) profile that
   * fails physical-plausibility bounds (see validate.ts) is treated as a
   * provider failure — the chain moves on, and if nothing valid remains the
   * request throws so the caller MASKS the cell (no-data) rather than rendering
   * a non-physical value. Off by default → validation is still computed and
   * attached to the result for provenance, but never enforced, so parity and
   * the calculator stay bit-comparable. The map/seed path turns this on.
   */
  validateProfiles?: boolean;
}

/** Thrown when every provider in the fallback chain failed. */
export class ProfileServiceError extends Error {
  readonly causes: { provider: string; error: string }[];

  constructor(message: string, causes: { provider: string; error: string }[]) {
    super(message);
    this.name = "ProfileServiceError";
    this.causes = causes;
  }
}
