import {
  cellToChildren,
  cellToParent,
  getRes0Cells,
  polygonToCells,
} from "h3-js";

/** Viewport → H3 cell enumeration for the Explorer choropleth. */

export interface ViewBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Soft cap on enumerated cells; above it we drop one resolution and retry. */
const MAX_CELLS = 4000;

/** Coarsest mapped resolution (also the only seeded one today). */
export const MIN_RES = 2;

/** zoom ≤3 → 2, 4–5 → 3, 6–7 → 4, 8–9 → 5, ≥10 → 6 (hard cap). */
export function zoomToRes(zoom: number): number {
  if (zoom < 4) return 2;
  if (zoom < 6) return 3;
  if (zoom < 8) return 4;
  if (zoom < 10) return 5;
  return 6;
}

function enumerateAtRes(bounds: ViewBounds, res: number): string[] {
  const south = Math.max(bounds.south, -85);
  const north = Math.min(bounds.north, 85);
  // Very wide views degenerate as polygons; enumerate globally instead.
  if (bounds.east - bounds.west >= 180) {
    const base = getRes0Cells();
    if (res <= 0) return base;
    return base.flatMap((cell) => cellToChildren(cell, res));
  }
  const ring: number[][] = [
    [south, bounds.west],
    [south, bounds.east],
    [north, bounds.east],
    [north, bounds.west],
    [south, bounds.west],
  ];
  return polygonToCells(ring, res);
}

/**
 * Enumerate visible cells at the zoom-mapped resolution; if the count exceeds
 * MAX_CELLS, drop one resolution and retry — but never below res 2 (the
 * coarsest mapped level; going lower would leave nothing to render).
 */
export function enumerateViewport(
  bounds: ViewBounds,
  zoom: number,
): { ids: string[]; res: number } {
  let res = zoomToRes(zoom);
  for (;;) {
    const ids = enumerateAtRes(bounds, res);
    if (ids.length <= MAX_CELLS || res <= MIN_RES) return { ids, res };
    res -= 1;
  }
}

/**
 * Visible ids plus every ancestor down to res 2, deduped — parent-fill needs
 * ancestor data when the visible resolution itself is unseeded.
 */
export function collectWithAncestors(ids: string[], res: number): string[] {
  if (res <= MIN_RES) return ids;
  const wanted = new Set(ids);
  for (const id of ids) {
    let cur = id;
    for (let r = res - 1; r >= MIN_RES; r -= 1) {
      cur = cellToParent(cur, r);
      if (wanted.has(cur)) break;
      wanted.add(cur);
    }
  }
  return [...wanted];
}
