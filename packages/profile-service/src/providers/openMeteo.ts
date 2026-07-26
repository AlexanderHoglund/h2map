import { airDensity, equivalentWindSpeed } from "../airDensity";
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
): Promise<{ hourly: ArchiveHourly; elevationM: number | null }> {
  const url =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${lat}&longitude=${lon}` +
    `&start_date=${year}-01-01&end_date=${year}-12-31` +
    `&hourly=${variables.join(",")}` +
    `&wind_speed_unit=ms&timezone=UTC`;
  const data = (await fetchJson(url)) as {
    hourly?: ArchiveHourly;
    elevation?: number;
  };
  if (!data.hourly) throw new Error(`open-meteo ${year}: response has no hourly block`);
  return {
    hourly: data.hourly,
    elevationM: typeof data.elevation === "number" ? data.elevation : null,
  };
}

/**
 * Wind capacity factors from the Open-Meteo ERA5 archive: per-hour power-law
 * shear from the 10 m/100 m pair to hub height, then the turbine curve.
 * Primary wind source — the spike showed NASA's fixed-α extrapolation runs
 * hot by up to 0.14 CF (see data/spike/comparison.json).
 *
 * With `correctAirDensity`, the hub-height speed is normalised to the turbine
 * curve's reference density (IEC 61400-12): the response `elevation` and
 * hourly `temperature_2m` give per-hour air density, and the power-curve
 * lookup uses the density-equivalent speed. This removes the ~22–33 % wind
 * overstatement at high-elevation sites. Default off → reference profiles are
 * unchanged (no temperature fetched, no correction).
 */
export async function fetchOpenMeteoWind(
  fetchJson: FetchJson,
  lat: number,
  lon: number,
  hubHeightM: number,
  curve: TurbineCurve,
  correctAirDensity = false,
): Promise<ProviderResult> {
  const variables = correctAirDensity
    ? ["wind_speed_10m", "wind_speed_100m", "temperature_2m"]
    : ["wind_speed_10m", "wind_speed_100m"];

  const series: YearSeries[] = [];
  let elevationM: number | null = null;
  let rhoSum = 0;
  let rhoCount = 0;
  let clampedHours = 0;
  for (
    let year = OPEN_METEO_TMY_YEARS.start;
    year <= OPEN_METEO_TMY_YEARS.end;
    year++
  ) {
    const { hourly, elevationM: elev } = await fetchArchiveYear(
      fetchJson,
      lat,
      lon,
      year,
      variables,
    );
    if (elev != null) elevationM = elev;
    const v10 = trimFeb29(hourlyVariable(hourly, "wind_speed_10m", year));
    const v100 = trimFeb29(hourlyVariable(hourly, "wind_speed_100m", year));
    const temp = correctAirDensity
      ? trimFeb29(hourlyVariable(hourly, "temperature_2m", year))
      : null;
    const z = elevationM ?? 0;
    const cf = v100.map((v, h) => {
      const lo = v10[h];
      if (v === null || lo === null || lo === undefined) return null;
      const alpha = shearExponent(lo, 10, v, 100);
      const vHub = toHubHeight(v, 100, hubHeightM, alpha);
      if (!correctAirDensity) return windCf(curve, vHub);
      const { rho, clamped } = airDensity(z, temp?.[h] ?? null);
      rhoSum += rho;
      rhoCount++;
      if (clamped) clampedHours++;
      return windCf(curve, equivalentWindSpeed(vHub, rho));
    });
    series.push({ year, cf });
  }

  const meanRho = rhoCount > 0 ? rhoSum / rhoCount : null;
  return {
    provider: "open-meteo",
    datasetTag:
      `om-era5-${OPEN_METEO_TMY_YEARS.start}-${OPEN_METEO_TMY_YEARS.end}-hub${hubHeightM}-${curve.id}` +
      (correctAirDensity ? "-airdensity" : ""),
    attribution: ATTRIBUTION,
    series,
    notes: [
      `power-law shear from 10 m/100 m, clamped alpha [0.05, 0.40], to ${hubHeightM} m hub`,
      correctAirDensity
        ? `air-density corrected (IEC 61400-12) at elevation ${elevationM ?? "?"} m; mean rho ${meanRho?.toFixed(3) ?? "?"} kg/m3; ${clampedHours} clamped hours`
        : `turbine curve ${curve.id}; no air-density correction`,
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
    const { hourly } = await fetchArchiveYear(fetchJson, lat, lon, year, [
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
