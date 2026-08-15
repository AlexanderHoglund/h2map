import { trimFeb29 } from "../time";
import type { FetchJson, ProfileKind, ProviderResult, YearSeries } from "../types";

const ATTRIBUTION =
  "PVGIS (c) European Commission, Joint Research Centre (EC JRC), https://re.jrc.ec.europa.eu/pvg_tools/";

/** Cap on how many trailing complete years feed the TMY. */
const MAX_YEARS = 10;

interface PvgisSeriesResponse {
  inputs?: { meteo_data?: { radiation_db?: string } };
  outputs?: { hourly?: Array<{ time?: string; P?: number }> };
}

/** PVGIS `trackingtype` values (1 horizontal N–S axis, 2 two-axis). */
const TRACKING_PARAM: Record<string, string> = {
  pv_1axis: "&trackingtype=1",
  pv_2axis: "&trackingtype=2",
};

/**
 * Cap on the fixed-mount tilt. The rule below tracks latitude, but past ~35°
 * the yield curve is flat while self-shading and wind load grow, so real
 * high-latitude arrays are not built at 60°+.
 */
const MAX_TILT_DEG = 35;

/**
 * Fixed-mount geometry for a cell — computed HERE, never delegated to PVGIS.
 *
 * `optimalangles=1` looks like the better answer and is a trap: near the
 * equator PVGIS's optimiser returns non-physical mountings — a 90° VERTICAL,
 * north-facing panel (azimuth −180°), or a valid 0° slope with a nonsense 52°
 * azimuth, or HTTP 500. A wall is not a solar array, so the series collapses
 * (measured at −0.86, 37.92: mean CF 0.084 / peak 0.41 optimised, versus
 * 0.179 / 0.83 for the same cell mounted flat). The T1.1 validation gate then
 * correctly rejected the optimised series as non-physical and the cell
 * rendered as no-data — which is what put the holes in Kenya's solar layer
 * (46 % of all equatorial cells, vs 0.4–5 % elsewhere).
 *
 * The standard planning rule — tilt ≈ |latitude|, equator-facing — is
 * deterministic, physically sound at every latitude, and makes cells
 * comparable on one stated assumption. It costs a little against a truly
 * optimal mounting at some mid-latitude sites (immaterial for a screening
 * map) and removes an entire class of upstream failure.
 *
 * Azimuth convention verified against the live API (2026-08-04), because it
 * is not what the echoed values suggest: `aspect=0` is EQUATOR-FACING in the
 * northern hemisphere (Spain 40.4°N, tilt 35: mean 0.175 at aspect 0 vs 0.090
 * at 180) and `aspect=180` is equator-facing in the southern (Chile 23.5°S,
 * tilt 23: mean 0.249 at aspect 180 vs 0.180 at 0).
 */
export function fixedMounting(lat: number): { tiltDeg: number; aspectDeg: number } {
  return {
    tiltDeg: Math.min(Math.round(Math.abs(lat)), MAX_TILT_DEG),
    aspectDeg: lat >= 0 ? 0 : 180,
  };
}

/**
 * The mounting fingerprint a CURRENT-generation `pv_fixed` dataset tag must
 * carry for this latitude — `-tilt{t}a{a}-`. Cells fetched before the
 * mounting rule existed carry no such token, and their profiles encode a
 * different (optimiser-chosen, sometimes non-physical) geometry: the cache
 * read uses this to treat them as a MISS rather than serving two mounting
 * assumptions side by side on one map.
 */
export function fixedMountingTag(lat: number): string {
  const { tiltDeg, aspectDeg } = fixedMounting(lat);
  return `-tilt${tiltDeg}a${aspectDeg}-`;
}

/**
 * Authoritative PV capacity factors from PVGIS's own PV model (seriescalc,
 * pvcalculation=1, 1 kWp, 14 % system loss). With peakpower=1 kWp the hourly
 * P is in W, so CF = P/1000. Fetches the full available multi-year range in
 * one request (no startyear/endyear — coverage varies by radiation DB), keeps
 * the trailing complete years.
 *
 * `radDb` pins the radiation database. Leave it undefined: PVGIS auto-resolves
 * to the best DB per cell (SARAH3/NSRDB satellite, reaching ERA5 only where it
 * is genuinely best, e.g. high latitude) — this is the authoritative pathway.
 * Do NOT pin `PVGIS-ERA5`: that endpoint is broken (HTTP 500s and ~3× too-low
 * capacity factors) and was the root cause of the Kenya solar speckle. The
 * parameter is retained only for diagnostics/comparison.
 */
export async function fetchPvgisPv(
  fetchJson: FetchJson,
  lat: number,
  lon: number,
  kind: ProfileKind,
  radDb?: string,
): Promise<ProviderResult> {
  // Fixed mount: our own latitude rule. Tracking kinds keep PVGIS's geometry
  // (a tracker has no fixed tilt to get wrong).
  const mounting = kind === "pv_fixed" ? fixedMounting(lat) : null;
  const geometry = mounting
    ? `&angle=${mounting.tiltDeg}&aspect=${mounting.aspectDeg}`
    : TRACKING_PARAM[kind];
  if (geometry === undefined) {
    throw new Error(`pvgis: unsupported kind ${kind}`);
  }
  const url =
    `https://re.jrc.ec.europa.eu/api/v5_3/seriescalc` +
    `?lat=${lat}&lon=${lon}` +
    `&pvcalculation=1&peakpower=1&loss=14${geometry}` +
    (radDb ? `&raddatabase=${radDb}` : "") +
    `&outputformat=json`;
  const data = (await fetchJson(url)) as PvgisSeriesResponse;

  const rows = data.outputs?.hourly;
  if (!rows || rows.length === 0) {
    throw new Error("pvgis: response has no outputs.hourly rows");
  }

  // Group rows by calendar year from "YYYYMMDD:HHmm" timestamps.
  const byYear = new Map<number, (number | null)[]>();
  for (const row of rows) {
    const time = row.time;
    if (typeof time !== "string" || time.length < 4) {
      throw new Error("pvgis: hourly row without parsable time");
    }
    const year = Number(time.slice(0, 4));
    let arr = byYear.get(year);
    if (!arr) {
      arr = [];
      byYear.set(year, arr);
    }
    arr.push(
      typeof row.P === "number" && Number.isFinite(row.P)
        ? Math.min(1, Math.max(0, row.P / 1000))
        : null,
    );
  }

  const completeYears = [...byYear.entries()]
    .filter(([, arr]) => arr.length === 8760 || arr.length === 8784)
    .sort(([a], [b]) => a - b)
    .slice(-MAX_YEARS);
  if (completeYears.length === 0) {
    throw new Error("pvgis: no complete calendar years in response");
  }

  const series: YearSeries[] = completeYears.map(([year, arr]) => ({
    year,
    cf: trimFeb29(arr),
  }));

  const radDbParam = radDb;
  const resolvedRadDb = data.inputs?.meteo_data?.radiation_db ?? radDbParam ?? "unknown";
  const firstYear = series[0]!.year;
  const lastYear = series[series.length - 1]!.year;
  return {
    provider: "pvgis-seriescalc",
    // Mounting geometry is PART OF THE TAG: the cache key is
    // (lat_r, lon_r, kind, mode, dataset_version), so without it a re-mounted
    // profile would silently upsert onto rows computed under a different
    // assumption and the two would be indistinguishable.
    datasetTag:
      `pvgis-5.3-${resolvedRadDb.toLowerCase()}-${kind}` +
      (mounting ? `-tilt${mounting.tiltDeg}a${mounting.aspectDeg}` : "") +
      `-${firstYear}-${lastYear}`,
    attribution: ATTRIBUTION,
    series,
    notes: [
      radDbParam
        ? `radiation database pinned to: ${resolvedRadDb}`
        : `radiation database auto-resolved to: ${resolvedRadDb}`,
      mounting
        ? `fixed mount, tilt ${mounting.tiltDeg}° aspect ${mounting.aspectDeg}° (latitude rule, equator-facing)`
        : "PVGIS tracking geometry",
      "PVGIS PV model incl. mounting/tracking geometry and temperature losses; 14 % system loss, 1 kWp",
    ],
  };
}
