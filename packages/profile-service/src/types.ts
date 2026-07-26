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
 * Cache port. `get` returns the newest profile for the coordinate/kind (any
 * dataset version); `put` persists a freshly built profile. Both are allowed
 * to fail soft — the service treats the cache as best-effort.
 */
export interface ProfileCache {
  get(
    latR: number,
    lonR: number,
    kind: ProfileKind,
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
   * PV: pin PVGIS to the global ERA5 radiation DB and drop the crude proxy
   * fallback (mask-as-no-data instead). One consistent PV model everywhere,
   * removing the coverage-edge seam. Off by default → PVGIS auto-resolves the
   * regional DB with the Open-Meteo crude proxy as fallback (reference behavior).
   */
  pvUnifiedEra5?: boolean;
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
