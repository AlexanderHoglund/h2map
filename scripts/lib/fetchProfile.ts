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
export async function fetchCfOrMask(
  deps: ProfileServiceDeps,
  lat: number,
  lon: number,
  kind: ProfileKind,
  log?: (message: string) => void,
): Promise<number[] | null> {
  try {
    return (await getResourceProfile({ lat, lon, kind }, deps)).cf;
  } catch (err) {
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
}
