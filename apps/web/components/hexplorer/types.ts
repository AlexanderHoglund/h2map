/** Shared types for the Explorer hexagon choropleth. */

export type LayerKey = "best" | "solar" | "wind";

export const LAYER_KEYS: readonly LayerKey[] = ["best", "solar", "wind"];

export function isLayerKey(value: unknown): value is LayerKey {
  return value === "best" || value === "solar" || value === "wind";
}

/** Cost years the choropleth carries; 2024 is current, the rest projected. */
export const COST_YEARS = [2024, 2030, 2040, 2050] as const;
export type CostYear = (typeof COST_YEARS)[number];

export function isCostYear(value: unknown): value is CostYear {
  return COST_YEARS.includes(value as CostYear);
}

/**
 * Basis for the "best combination" layer (P1 #5 / #6). `default` is the
 * resource-driven map (uniform 8% financing, fixed 2:1 sizing); the others are
 * optional analytical views. Only affects the `best` layer.
 */
export type LayerBasis = "default" | "wacc" | "optimal";
export const LAYER_BASES: readonly LayerBasis[] = ["default", "wacc", "optimal"];
export function isLayerBasis(value: unknown): value is LayerBasis {
  return value === "default" || value === "wacc" || value === "optimal";
}

/** Basemap choices for the map surface (default vector, satellite, topographic). */
export type Basemap = "default" | "satellite" | "topographic";
export const BASEMAPS: readonly Basemap[] = ["default", "satellite", "topographic"];

interface YearLcoh {
  best: number | null;
  solar: number | null;
  wind: number | null;
}

export type CellStatus = "computing" | "ready" | "failed";

/** One cell as returned by POST /api/v1/hex. */
export interface CellData {
  h3: string;
  status: CellStatus;
  lcohBest: number | null;
  lcohSolar: number | null;
  lcohWind: number | null;
  bestPvMw: number | null;
  bestWindMw: number | null;
  solarCf: number | null;
  windCf: number | null;
  /** Future cost years, e.g. {"2030":{best,solar,wind},...}; 2024 is above. */
  years: Record<string, YearLcoh> | null;
  /** P1 #5 risk-adjusted best per year {"2024":n,...}; null until recomputed. */
  wacc: Record<string, number> | null;
  /** P1 #6 best-achievable per year {"2024":{best,ratio,pvShare},...}; null until recomputed. */
  optimal: Record<string, { best: number; ratio: number; pvShare: number }> | null;
  /**
   * Which PVGIS radiation database served this cell. 'era5' is not a
   * degraded tier: outside the Meteosat disc it is the only database PVGIS
   * v5_3 offers, and where both exist the two agree within a few percent.
   * Null until a recompute pass has visited the cell.
   */
  pvDbTier: PvDbTier | null;
  /**
   * 'improved' = Open-Meteo (air density + IEC turbine class); 'fallback' =
   * NASA POWER's generic curve with fixed shear — a real modelling
   * difference the map must not hide.
   */
  windFidelity: WindFidelity | null;
}

export type PvDbTier = "satellite" | "era5";
export type WindFidelity = "improved" | "fallback";

/** Cache entry: server data, or "missing" (ocean / unseeded — do not re-request). */
export type CacheEntry = CellData | "missing";

/**
 * One hexagon handed to deck.gl. `h3` is the visible cell; `data` is the cell
 * whose values are shown (an ancestor when `parentFill` is true).
 */
export interface HexDatum {
  h3: string;
  value: number;
  parentFill: boolean;
  data: CellData;
}

/** Value of `cell` on the given layer + cost year; null = "treat as missing". */
export function layerValue(
  cell: CellData,
  layer: LayerKey,
  year: CostYear,
  basis: LayerBasis = "default",
): number | null {
  // The WACC / best-achievable bases only re-express the "best" layer; solar
  // and wind are single-source and always use the default columns.
  if (layer === "best" && basis === "wacc") return cell.wacc?.[String(year)] ?? null;
  if (layer === "best" && basis === "optimal")
    return cell.optimal?.[String(year)]?.best ?? null;
  const trio: YearLcoh =
    year === 2024
      ? { best: cell.lcohBest, solar: cell.lcohSolar, wind: cell.lcohWind }
      : (cell.years?.[String(year)] ?? { best: null, solar: null, wind: null });
  return trio[layer];
}
