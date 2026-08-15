import { fetchNasaPowerWind } from "./providers/nasaPower";
import {
  fetchOpenMeteoPvCrude,
  fetchOpenMeteoWind,
} from "./providers/openMeteo";
import { fetchPvgisPv, fixedMountingTag } from "./providers/pvgis";
import { buildTmy } from "./tmy";
import { fillGaps, HOURS_PER_YEAR } from "./time";
import { validateProfile, type ProfileValidation } from "./validate";
import type {
  BuiltProfile,
  ProfileKind,
  ProfileMode,
  ProfileServiceDeps,
  ProviderResult,
} from "./types";
import { ProfileServiceError } from "./types";

/**
 * Which cache mode a request resolves to. A profile is `improved` only when an
 * improved flag that actually affects THIS kind is set (wind: air-density /
 * turbine class; PV: mask-unservable), so a wind-only or PV-only improved request
 * doesn't mislabel the other kind. Default off → `reference`, so parity and the
 * calculator (which set no improved flags) always read the reference profiles.
 */
function profileMode(kind: ProfileKind, deps: ProfileServiceDeps): ProfileMode {
  const improved = kind.startsWith("wind")
    ? Boolean(deps.windAirDensityCorrection || deps.windTurbineClassSelection)
    : Boolean(deps.pvMaskUnservable);
  return improved ? "improved" : "reference";
}

/**
 * The CURRENT-generation predicate for a cache read (see ProfileCache.get).
 *
 * A cached row is only usable if it was built by the model we would build
 * today. Two generations are distinguishable from the dataset tag alone:
 *
 * - `pv_fixed` carries its mounting as `-tilt{t}a{a}-`. Rows fetched before
 *   the mounting rule existed carry no such token (their geometry came from
 *   PVGIS's tilt optimiser, which returns non-physical mountings near the
 *   equator); rows fetched at a different latitude band carry a different
 *   one. Either way the encoded model differs from today's, so: MISS.
 * - The map's PV chain is PVGIS-only. A row from the retired crude
 *   Open-Meteo GHI fallback can no longer be produced under `pvMaskUnservable`
 *   and must not be served as if it could: MISS.
 *
 * Wind tags encode the IEC class, which is chosen FROM the fetched series —
 * it cannot be known before the fetch, so wind accepts any generation and
 * relies on `mode` alone. Documented asymmetry, not an oversight.
 */
function currentGeneration(
  kind: ProfileKind,
  lat: number,
  deps: ProfileServiceDeps,
): ((datasetVersion: string, provider: string) => boolean) | undefined {
  if (kind !== "pv_fixed") return undefined;
  const mountingTag = fixedMountingTag(lat);
  const pvgisOnly = Boolean(deps.pvMaskUnservable);
  return (datasetVersion, provider) => {
    if (pvgisOnly && !provider.startsWith("pvgis")) return false;
    return datasetVersion.includes(mountingTag);
  };
}

/**
 * Coordinate quantization step in degrees (~11 km N–S). Coarser than the
 * PVGIS radiation grid but finer than ERA5 (~25 km); one cache row serves a
 * whole map-click neighborhood. Changing this invalidates nothing (old rows
 * simply stop being hit), but do it deliberately.
 */
export const COORD_STEP = 0.1;

/** A provider year with more than 5 % gap hours is dropped from the TMY pool. */
const MAX_GAP_HOURS_PER_YEAR = Math.floor(HOURS_PER_YEAR * 0.05);

export function quantizeCoord(x: number): number {
  // Round to the step grid, then to 4 decimals to match numeric(7,4) exactly.
  return Number((Math.round(x / COORD_STEP) * COORD_STEP).toFixed(4));
}

export function attributionFor(provider: string): string {
  if (provider.startsWith("pvgis")) {
    return "PVGIS (c) European Commission, Joint Research Centre (EC JRC), https://re.jrc.ec.europa.eu/pvg_tools/";
  }
  if (provider.startsWith("nasa")) {
    return "Data obtained from the NASA Langley Research Center POWER Project funded through the NASA Earth Science Directorate";
  }
  return "Weather data by Open-Meteo.com (CC BY 4.0), based on ERA5 (Copernicus Climate Change Service)";
}

export interface ResourceProfileResult {
  latR: number;
  lonR: number;
  kind: ProfileKind;
  provider: string;
  datasetVersion: string;
  attribution: string;
  /** Exactly 8760 values in [0, 1]. */
  cf: number[];
  cacheHit: boolean;
  /**
   * T1.1 physical-plausibility verdict for the returned profile. Always
   * computed; only ENFORCED (→ masked cell) when deps.validateProfiles is set.
   */
  validation: ProfileValidation;
  /** Present only on freshly built (non-cached) profiles. */
  build?: {
    yearsUsed: [number, number];
    selectedYearByMonth: number[];
    gapHours: number;
    notes: string[];
  };
}

const HUB_HEIGHT_BY_KIND: Partial<Record<ProfileKind, number>> = {
  wind_120: 120,
  wind_160: 160,
};

/**
 * Resolve a resource profile: quantize the coordinate, try the cache, then
 * walk the provider fallback chain (PV: PVGIS → Open-Meteo crude proxy;
 * wind: Open-Meteo → NASA POWER), build a TMY from the surviving years, and
 * cache the result best-effort.
 */
export async function getResourceProfile(
  request: { lat: number; lon: number; kind: ProfileKind },
  deps: ProfileServiceDeps,
): Promise<ResourceProfileResult> {
  const log = deps.log ?? (() => {});
  const latR = quantizeCoord(request.lat);
  const lonR = quantizeCoord(request.lon);
  const { kind } = request;
  const mode = profileMode(kind, deps);

  if (deps.cache) {
    try {
      const cached = await deps.cache.get(
        latR,
        lonR,
        kind,
        mode,
        currentGeneration(kind, request.lat, deps),
      );
      if (cached && cached.cf.length === HOURS_PER_YEAR) {
        const validation = validateProfile(cached.cf, kind, latR);
        // A pre-gate bad row could still be cached; when enforcing, skip it and
        // fall through to a fresh fetch (which re-validates and may mask).
        if (deps.validateProfiles && !validation.ok) {
          log(
            `cached profile failed validation for (${latR}, ${lonR}, ${kind}); refetching: ${validation.reasons.join("; ")}`,
          );
        } else {
          return {
            latR,
            lonR,
            kind,
            provider: cached.provider,
            datasetVersion: cached.datasetVersion,
            attribution: attributionFor(cached.provider),
            cf: cached.cf,
            cacheHit: true,
            validation,
          };
        }
      }
    } catch (err) {
      log(`profile cache read failed (continuing to providers): ${String(err)}`);
    }
  }

  const chain = await providerChain(request.lat, request.lon, kind, deps);
  const failures: { provider: string; error: string }[] = [];

  for (const { name, run } of chain) {
    let raw: ProviderResult;
    try {
      raw = await run();
    } catch (err) {
      log(`provider ${name} failed for (${latR}, ${lonR}, ${kind}): ${String(err)}`);
      failures.push({ provider: name, error: String(err) });
      continue;
    }

    const profile = buildProfileFromProvider(raw, latR, lonR, kind, mode, log);
    if (!profile) {
      failures.push({
        provider: name,
        error: "all provider years exceeded the gap threshold",
      });
      continue;
    }

    const validation = validateProfile(profile.cf, kind, latR);
    if (deps.validateProfiles && !validation.ok) {
      // Non-physical profile: don't cache it, and treat it as a provider
      // failure so the chain moves on (and the cell masks if nothing valid
      // remains) rather than colouring the map with an artifact.
      log(
        `provider ${name} failed validation for (${latR}, ${lonR}, ${kind}): ${validation.reasons.join("; ")}`,
      );
      failures.push({
        provider: name,
        error: `validation: ${validation.reasons.join("; ")}`,
      });
      continue;
    }

    if (deps.cache) {
      try {
        await deps.cache.put(profile);
      } catch (err) {
        log(`profile cache write failed (serving uncached): ${String(err)}`);
      }
    }
    return {
      latR,
      lonR,
      kind,
      provider: profile.provider,
      datasetVersion: profile.datasetVersion,
      attribution: profile.meta.attribution,
      cf: profile.cf,
      cacheHit: false,
      validation,
      build: {
        yearsUsed: profile.yearsUsed,
        selectedYearByMonth: profile.meta.selectedYearByMonth,
        gapHours: profile.meta.gapHours,
        notes: profile.meta.notes,
      },
    };
  }

  throw new ProfileServiceError(
    `no provider could supply a ${kind} profile for (${latR}, ${lonR})`,
    failures,
  );
}

interface ChainEntry {
  name: string;
  run: () => Promise<ProviderResult>;
}

async function providerChain(
  lat: number,
  lon: number,
  kind: ProfileKind,
  deps: ProfileServiceDeps,
): Promise<ChainEntry[]> {
  const hub = HUB_HEIGHT_BY_KIND[kind];
  if (hub !== undefined) {
    if (!deps.getTurbineCurve) {
      throw new Error(`profile service: wind kind ${kind} requires getTurbineCurve`);
    }
    const curve = await deps.getTurbineCurve();
    return [
      {
        name: "open-meteo",
        run: () =>
          fetchOpenMeteoWind(deps.fetchJson, lat, lon, hub, curve, {
            correctAirDensity: deps.windAirDensityCorrection ?? false,
            selectClass: deps.windTurbineClassSelection ?? false,
          }),
      },
      {
        name: "nasa-power",
        run: () => fetchNasaPowerWind(deps.fetchJson, lat, lon, hub, curve),
      },
    ];
  }
  // Map/mask mode: PV is served ONLY by auto-resolved PVGIS (its own choice of
  // SARAH3 / NSRDB / ERA5 satellite DB per cell — one consistent, tilt-aware PV
  // model everywhere). No crude Open-Meteo GHI fallback: a cell PVGIS can't
  // serve renders no-data rather than a differently-modelled value that would
  // sit as a non-comparable seam next to its neighbours. (Earlier this pinned
  // raddatabase=PVGIS-ERA5, but that endpoint is broken — HTTP 500s and ~3×
  // too-low capacity factors — and was the root cause of Kenya's speckle. The
  // auto-resolve path reaches ERA5 only where it is genuinely the best DB.)
  if (deps.pvMaskUnservable) {
    return [
      {
        name: "pvgis-auto",
        run: () => fetchPvgisPv(deps.fetchJson, lat, lon, kind),
      },
    ];
  }
  return [
    {
      name: "pvgis-seriescalc",
      run: () => fetchPvgisPv(deps.fetchJson, lat, lon, kind),
    },
    {
      name: "open-meteo-crude",
      run: () => fetchOpenMeteoPvCrude(deps.fetchJson, lat, lon),
    },
  ];
}

function buildProfileFromProvider(
  raw: ProviderResult,
  latR: number,
  lonR: number,
  kind: ProfileKind,
  mode: ProfileMode,
  log: (message: string) => void,
): BuiltProfile | null {
  const kept: { year: number; cf: number[] }[] = [];
  let gapHours = 0;
  for (const year of raw.series) {
    const filled = fillGaps(year.cf);
    if (filled.gapHours > MAX_GAP_HOURS_PER_YEAR) {
      log(
        `dropping ${raw.provider} year ${year.year}: ${filled.gapHours} gap hours exceed threshold`,
      );
      continue;
    }
    gapHours += filled.gapHours;
    kept.push({ year: year.year, cf: filled.cf });
  }
  if (kept.length === 0) return null;

  const tmy = buildTmy(kept);
  const cf = tmy.cf.map((v) => round4(Math.min(1, Math.max(0, v))));
  return {
    latR,
    lonR,
    kind,
    mode,
    provider: raw.provider,
    datasetVersion: `${raw.datasetTag}/tmy-v1`,
    yearsUsed: [kept[0]!.year, kept[kept.length - 1]!.year],
    cf,
    meta: {
      selectedYearByMonth: tmy.selectedYearByMonth,
      gapHours,
      attribution: raw.attribution,
      notes: raw.notes ?? [],
    },
  };
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
