/** Shared types for the Explorer hexagon choropleth. */

export type LayerKey = "best" | "solar" | "wind";

export const LAYER_KEYS: readonly LayerKey[] = ["best", "solar", "wind"];

export function isLayerKey(value: unknown): value is LayerKey {
  return value === "best" || value === "solar" || value === "wind";
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

/** Value of `cell` on the given layer; null means "treat as missing". */
export function layerValue(cell: CellData, layer: LayerKey): number | null {
  switch (layer) {
    case "best":
      return cell.lcohBest;
    case "solar":
      return cell.lcohSolar;
    case "wind":
      return cell.lcohWind;
  }
}
