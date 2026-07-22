import { windCf } from "../powerCurve";
import { crudePvCf } from "../pvCrude";
import { shearExponent, toHubHeight } from "../shear";
import { trimFeb29 } from "../time";
import type {
  FetchJson,
  ProviderResult,
  TurbineCurve,
  YearSeries,
} from "../types";

/**
 * Year window the wind/crude-PV TMYs are built from. ERA5 reanalysis is
 * complete for this whole span; bump the window (and the dataset tag with
 * it) deliberately, not automatically, so cache keys stay stable.
 */
export const OPEN_METEO_TMY_YEARS = { start: 2015, end: 2024 } as const;

const ATTRIBUTION =
  "Weather data by Open-Meteo.com (CC BY 4.0), based on ERA5 (Copernicus Climate Change Service)";

interface ArchiveHourly {
  time?: unknown;
  [variable: string]: unknown;
}

function hourlyVariable(
  hourly: ArchiveHourly,
  name: string,
  year: number,
): (number | null)[] {
  const values = hourly[name];
  if (!Array.isArray(values)) {
    throw new Error(`open-meteo ${year}: missing hourly variable ${name}`);
  }
  return values.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));
}

async function fetchArchiveYear(
  fetchJson: FetchJson,
  lat: number,
  lon: number,
  year: number,
  variables: string[],
): Promise<ArchiveHourly> {
  const url =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${lat}&longitude=${lon}` +
    `&start_date=${year}-01-01&end_date=${year}-12-31` +
    `&hourly=${variables.join(",")}` +
    `&wind_speed_unit=ms&timezone=UTC`;
  const data = (await fetchJson(url)) as { hourly?: ArchiveHourly };
  if (!data.hourly) throw new Error(`open-meteo ${year}: response has no hourly block`);
  return data.hourly;
}

/**
 * Wind capacity factors from the Open-Meteo ERA5 archive: per-hour power-law
 * shear from the 10 m/100 m pair to hub height, then the turbine curve.
 * Primary wind source — the spike showed NASA's fixed-α extrapolation runs
 * hot by up to 0.14 CF (see data/spike/comparison.json).
 */
export async function fetchOpenMeteoWind(
  fetchJson: FetchJson,
  lat: number,
  lon: number,
  hubHeightM: number,
  curve: TurbineCurve,
): Promise<ProviderResult> {
  const series: YearSeries[] = [];
  for (
    let year = OPEN_METEO_TMY_YEARS.start;
    year <= OPEN_METEO_TMY_YEARS.end;
    year++
  ) {
    const hourly = await fetchArchiveYear(fetchJson, lat, lon, year, [
      "wind_speed_10m",
      "wind_speed_100m",
    ]);
    const v10 = trimFeb29(hourlyVariable(hourly, "wind_speed_10m", year));
    const v100 = trimFeb29(hourlyVariable(hourly, "wind_speed_100m", year));
    const cf = v100.map((v, h) => {
      const lo = v10[h];
      if (v === null || lo === null || lo === undefined) return null;
      const alpha = shearExponent(lo, 10, v, 100);
      return windCf(curve, toHubHeight(v, 100, hubHeightM, alpha));
    });
    series.push({ year, cf });
  }
  return {
    provider: "open-meteo",
    datasetTag: `om-era5-${OPEN_METEO_TMY_YEARS.start}-${OPEN_METEO_TMY_YEARS.end}-hub${hubHeightM}-${curve.id}`,
    attribution: ATTRIBUTION,
    series,
    notes: [
      `power-law shear from 10 m/100 m, clamped alpha [0.05, 0.40], to ${hubHeightM} m hub`,
      `turbine curve ${curve.id}; no air-density correction`,
    ],
  };
}

/**
 * Crude horizontal PV proxy from ERA5 GHI. Last-resort fallback only —
 * no transposition, tracking geometry, or temperature model.
 */
export async function fetchOpenMeteoPvCrude(
  fetchJson: FetchJson,
  lat: number,
  lon: number,
): Promise<ProviderResult> {
  const series: YearSeries[] = [];
  for (
    let year = OPEN_METEO_TMY_YEARS.start;
    year <= OPEN_METEO_TMY_YEARS.end;
    year++
  ) {
    const hourly = await fetchArchiveYear(fetchJson, lat, lon, year, [
      "shortwave_radiation",
    ]);
    const ghi = trimFeb29(hourlyVariable(hourly, "shortwave_radiation", year));
    series.push({ year, cf: ghi.map(crudePvCf) });
  }
  return {
    provider: "open-meteo-crude",
    datasetTag: `om-era5-ghi-${OPEN_METEO_TMY_YEARS.start}-${OPEN_METEO_TMY_YEARS.end}`,
    attribution: ATTRIBUTION,
    series,
    notes: [
      "CRUDE horizontal proxy (GHI/1000 x 0.9 PR): fallback fidelity only, tracking kinds not modeled",
    ],
  };
}
