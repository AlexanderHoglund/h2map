import {
  getResourceProfile,
  ProfileServiceError,
  type ProfileKind,
  type ProfileServiceDeps,
} from "@h2map/profile-service";

/**
 * Fetch a resource profile's CF, distinguishing the two failure modes the
 * seeding path must treat differently:
 *
 * - **Genuine non-physical data** — the provider returned a profile that failed
 *   the T1.1 validation gate (e.g. PVGIS-SARAH3 artifact, peak CF 0.39). This
 *   is permanent, so we return `null`: the caller masks THIS layer (no-data)
 *   while the cell's other source survives.
 * - **Transient provider failure** — HTTP 500, network error, or a
 *   recompute-mode cache miss. We rethrow so the caller fails/skips the WHOLE
 *   cell and retries it later, rather than freezing it as a permanently
 *   single-source cell that the skip-set would never revisit.
 *
 * The two are told apart by the ProfileServiceError causes: the gate tags its
 * rejection `validation: …`, every provider error is anything else.
 */
/**
 * Which data tier served a cell, for per-cell provenance on the map.
 *
 * PV: `satellite` = PVGIS resolved a satellite radiation database (SARAH3,
 * inside the Meteosat disc); `era5` = the reanalysis, which is the ONLY
 * option PVGIS v5_3 offers outside that disc — the Americas, Asia-Pacific
 * and Oceania. Not a quality ranking: measured against SARAH3 where both
 * exist, ERA5 lands within a few percent and in either direction.
 *
 * Wind: `improved` = Open-Meteo with air-density correction and IEC class
 * selection; `fallback` = the NASA POWER path, a generic curve with fixed
 * 1/7 shear and neither correction. That IS a fidelity difference, and the
 * map distinguishes it.
 */
export type PvDbTier = "satellite" | "era5";
export type WindFidelity = "improved" | "fallback";

export function pvDbTier(datasetVersion: string): PvDbTier {
  return datasetVersion.includes("-era5-") || datasetVersion.includes("om-era5")
    ? "era5"
    : "satellite";
}

export function windFidelity(provider: string): WindFidelity {
  return provider.startsWith("open-meteo") ? "improved" : "fallback";
}

/** A masked layer carries no profile; otherwise the series plus its origin. */
export interface CfWithProvenance {
  cf: number[];
  provider: string;
  datasetVersion: string;
}

/** Provenance-preserving variant of {@link fetchCfOrMask}. */
export async function fetchProfileOrMask(
  deps: ProfileServiceDeps,
  lat: number,
  lon: number,
  kind: ProfileKind,
  log?: (message: string) => void,
): Promise<CfWithProvenance | null> {
  try {
    const r = await getResourceProfile({ lat, lon, kind }, deps);
    return { cf: r.cf, provider: r.provider, datasetVersion: r.datasetVersion };
  } catch (err) {
    return maskOrRethrow(err, kind, log);
  }
}

export async function fetchCfOrMask(
  deps: ProfileServiceDeps,
  lat: number,
  lon: number,
  kind: ProfileKind,
  log?: (message: string) => void,
): Promise<number[] | null> {
  const r = await fetchProfileOrMask(deps, lat, lon, kind, log);
  return r ? r.cf : null;
}

/** Gate rejection → mask this layer; anything else is transient → rethrow. */
function maskOrRethrow(
  err: unknown,
  kind: ProfileKind,
  log?: (message: string) => void,
): null {
  const nonPhysical =
    err instanceof ProfileServiceError &&
    err.causes.length > 0 &&
    err.causes.every((c) => c.error.startsWith("validation:"));
  if (nonPhysical) {
    log?.(
      `${kind} masked (non-physical): ${(err as ProfileServiceError).causes
        .map((c) => c.error)
        .join("; ")}`,
    );
    return null;
  }
  throw err;
}
