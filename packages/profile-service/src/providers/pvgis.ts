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

/** PVGIS `trackingtype` values (0 fixed, 1 horizontal N–S axis, 2 two-axis). */
const TRACKING_PARAM: Record<string, string> = {
  pv_fixed: "&optimalangles=1",
  pv_1axis: "&trackingtype=1",
  pv_2axis: "&trackingtype=2",
};

/**
 * Authoritative PV capacity factors from PVGIS's own PV model (seriescalc,
 * pvcalculation=1, 1 kWp, 14 % system loss). With peakpower=1 kWp the hourly
 * P is in W, so CF = P/1000. Fetches the full available multi-year range in
 * one request (no startyear/endyear — coverage varies by radiation DB), keeps
 * the trailing complete years.
 *
 * `radDb` pins the radiation database (e.g. `PVGIS-ERA5`). Left undefined,
 * PVGIS auto-resolves to the best regional satellite DB (SARAH/NSRDB/…), whose
 * coverage ends at ~±65° latitude and specific longitude bands — beyond which
 * the map used a categorically different crude proxy, leaving a visible seam.
 * Pinning ERA5 (global reanalysis) gives one consistent PV model everywhere and
 * removes the seam; internal consistency beats per-cell accuracy for screening.
 */
export async function fetchPvgisPv(
  fetchJson: FetchJson,
  lat: number,
  lon: number,
  kind: ProfileKind,
  radDb?: string,
): Promise<ProviderResult> {
  const tracking = TRACKING_PARAM[kind];
  if (tracking === undefined) {
    throw new Error(`pvgis: unsupported kind ${kind}`);
  }
  const url =
    `https://re.jrc.ec.europa.eu/api/v5_3/seriescalc` +
    `?lat=${lat}&lon=${lon}` +
    `&pvcalculation=1&peakpower=1&loss=14${tracking}` +
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
    datasetTag: `pvgis-5.3-${resolvedRadDb.toLowerCase()}-${kind}-${firstYear}-${lastYear}`,
    attribution: ATTRIBUTION,
    series,
    notes: [
      radDbParam
        ? `radiation database pinned to: ${resolvedRadDb}`
        : `radiation database auto-resolved to: ${resolvedRadDb}`,
      "PVGIS PV model incl. mounting/tracking geometry and temperature losses; 14 % system loss, 1 kWp",
    ],
  };
}
