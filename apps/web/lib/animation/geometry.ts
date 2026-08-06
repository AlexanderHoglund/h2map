import type { Point } from "./types";

/**
 * Point-in-polygon (ray casting), for checking that a route stays in water.
 *
 * Lives here rather than in a scene because "does this track cross the
 * coastline" is a question any future map-like scene will want to ask.
 */
export function pointInPolygon(polygon: readonly Point[], x: number, y: number): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (!a || !b) continue;
    const [xi, yi] = a;
    const [xj, yj] = b;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Sample a track (plus a margin either side for the hull) and report how many
 * samples fall inside any landmass. Zero means the whole vessel stays afloat.
 */
export function landfallCount(
  track: readonly Point[],
  landmasses: readonly (readonly Point[])[],
  halfBeam = 4,
  samplesPerLeg = 200,
): number {
  let hits = 0;
  for (let i = 0; i < track.length - 1; i += 1) {
    const from = track[i];
    const to = track[i + 1];
    if (!from || !to) continue;
    for (let s = 0; s <= samplesPerLeg; s += 1) {
      const t = s / samplesPerLeg;
      const x = from[0] + (to[0] - from[0]) * t;
      const y = from[1] + (to[1] - from[1]) * t;
      for (const [dx, dy] of [
        [0, 0],
        [halfBeam, 0],
        [-halfBeam, 0],
        [0, halfBeam],
        [0, -halfBeam],
      ] as const) {
        for (const land of landmasses) {
          if (pointInPolygon(land, x + dx, y + dy)) hits += 1;
        }
      }
    }
  }
  return hits;
}
