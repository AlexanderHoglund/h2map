import { windCf } from "../powerCurve";
import { DEFAULT_ALPHA, toHubHeight } from "../shear";
import type {
  FetchJson,
  ProviderResult,
  TurbineCurve,
  YearSeries,
} from "../types";

export const NASA_TMY_YEARS = { start: 2015, end: 2024 } as const;

const ATTRIBUTION =
  "Data obtained from the NASA Langley Research Center POWER Project funded through the NASA Earth Science Directorate";

interface NasaPowerResponse {
  properties?: { parameter?: { WS50M?: Record<string, number> } };
}

/**
 * Fallback wind source: NASA POWER hourly WS50M extrapolated with a fixed
 * α = 1/7 (only one usable height). The spike showed this runs up to 0.14 CF
 * hot vs. Open-Meteo's two-height shear — fallback fidelity only.
 */
export async function fetchNasaPowerWind(
  fetchJson: FetchJson,
  lat: number,
  lon: number,
  hubHeightM: number,
  curve: TurbineCurve,
): Promise<ProviderResult> {
  const series: YearSeries[] = [];
  for (let year = NASA_TMY_YEARS.start; year <= NASA_TMY_YEARS.end; year++) {
    const url =
      `https://power.larc.nasa.gov/api/temporal/hourly/point` +
      `?parameters=WS50M&community=RE` +
      `&latitude=${lat}&longitude=${lon}` +
      `&start=${year}0101&end=${year}1231` +
      `&format=JSON&time-standard=utc`;
    const data = (await fetchJson(url)) as NasaPowerResponse;
    const ws50 = data.properties?.parameter?.WS50M;
    if (!ws50) throw new Error(`nasa-power ${year}: response has no WS50M block`);

    // Keys are "YYYYMMDDHH" in UTC; drop Feb 29 to normalize to 8760.
    const keys = Object.keys(ws50)
      .filter((k) => k.slice(4, 8) !== "0229")
      .sort();
    if (keys.length !== 8760) {
      throw new Error(
        `nasa-power ${year}: expected 8760 non-leap hours, got ${keys.length}`,
      );
    }
    const cf = keys.map((k) => {
      const v = ws50[k];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
      return windCf(curve, toHubHeight(v, 50, hubHeightM, DEFAULT_ALPHA));
    });
    series.push({ year, cf });
  }
  return {
    provider: "nasa-power",
    datasetTag: `nasa-power-${NASA_TMY_YEARS.start}-${NASA_TMY_YEARS.end}-hub${hubHeightM}-${curve.id}`,
    attribution: ATTRIBUTION,
    series,
    notes: [
      `fixed alpha 1/7 extrapolation from WS50M to ${hubHeightM} m (single height available)`,
      `turbine curve ${curve.id}; no air-density correction; -999 fills mapped to gaps`,
    ],
  };
}
