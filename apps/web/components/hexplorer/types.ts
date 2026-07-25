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
}

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
): number | null {
  const trio: YearLcoh =
    year === 2024
      ? { best: cell.lcohBest, solar: cell.lcohSolar, wind: cell.lcohWind }
      : (cell.years?.[String(year)] ?? { best: null, solar: null, wind: null });
  return trio[layer];
}
