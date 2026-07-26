import { fetchNasaPowerWind } from "./providers/nasaPower";
import {
  fetchOpenMeteoPvCrude,
  fetchOpenMeteoWind,
} from "./providers/openMeteo";
import { fetchPvgisPv } from "./providers/pvgis";
import { buildTmy } from "./tmy";
import { fillGaps, HOURS_PER_YEAR } from "./time";
import type {
  BuiltProfile,
  ProfileKind,
  ProfileServiceDeps,
  ProviderResult,
} from "./types";
import { ProfileServiceError } from "./types";

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

  if (deps.cache) {
    try {
      const cached = await deps.cache.get(latR, lonR, kind);
      if (cached && cached.cf.length === HOURS_PER_YEAR) {
        return {
          latR,
          lonR,
          kind,
          provider: cached.provider,
          datasetVersion: cached.datasetVersion,
          attribution: attributionFor(cached.provider),
          cf: cached.cf,
          cacheHit: true,
        };
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

    const profile = buildProfileFromProvider(raw, latR, lonR, kind, log);
    if (!profile) {
      failures.push({
        provider: name,
        error: "all provider years exceeded the gap threshold",
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
