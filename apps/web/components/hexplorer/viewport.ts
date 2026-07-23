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

/** Coarsest mapped resolution (world view). */
export const MIN_RES = 2;

/**
 * Finest displayed resolution. Capped at the deepest SEEDED resolution:
 * subdividing further only multiplies identical parent-filled ghosts (every
 * child inherits the same ancestor value), which reads as "all hexes the same
 * color". Raise together with deeper seeding passes. Res 5 is seeded in the
 * Magallanes core; elsewhere the coverage chooser stays at 4 or coarser.
 */
export const MAX_RES = 5;

/** Smaller hexes early: <2.75 → 2, <4.25 → 3, <6.25 → 4, then 5. */
export function zoomToRes(zoom: number): number {
  if (zoom < 2.75) return 2;
  if (zoom < 4.25) return 3;
  if (zoom < 6.25) return 4;
  return MAX_RES;
}

/** Wrap a longitude into [-180, 180]. */
function normLng(lng: number): number {
  const n = ((((lng + 180) % 360) + 360) % 360) - 180;
  return n;
}

function boxCells(
  south: number,
  north: number,
  west: number,
  east: number,
  res: number,
): string[] {
  if (east - west < 1e-6) return [];
  const ring: number[][] = [
    [south, west],
    [south, east],
    [north, east],
    [north, west],
    [south, west],
  ];
  try {
    return polygonToCells(ring, res);
  } catch {
    // h3 rejects degenerate rings near the poles/antimeridian — render
    // nothing for this frame rather than crash the map.
    return [];
  }
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
  // maplibre bounds can exceed ±180 after panning across the antimeridian;
  // h3 rejects out-of-range longitudes. Normalize, and when the box wraps,
  // split it into two h3-legal boxes on either side of the meridian.
  const west = normLng(bounds.west);
  let east = normLng(bounds.east);
  if (east === -180) east = 180;
  if (west <= east) return boxCells(south, north, west, east, res);
  return [
    ...boxCells(south, north, west, 180, res),
    ...boxCells(south, north, -180, east, res),
  ];
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
