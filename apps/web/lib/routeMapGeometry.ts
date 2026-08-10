/**
 * Pure geometry for the corridor route map: longitude wrapping around a
 * corridor-chosen centre (the antimeridian handling — Mejillones → Japan
 * crosses the date line, and a naive polyline renders as a horizontal
 * streak across the whole map), an equirectangular fit-to-bbox projection,
 * and great-circle interpolation for the schematic fallback. No DOM — unit
 * tested by a pure-import spec.
 */

export type LonLat = readonly [number, number];

/** Wrap a longitude into [center-180, center+180). */
export function wrapLon(lon: number, centerLon: number): number {
  let x = lon;
  while (x < centerLon - 180) x += 360;
  while (x >= centerLon + 180) x -= 360;
  return x;
}

/** The corridor's natural centre: the midpoint of the SHORTER arc between
 *  the two port longitudes — Pacific-centred when the route crosses ±180. */
export function corridorCenterLon(lonA: number, lonB: number): number {
  let d = lonB - lonA;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return wrapLon(lonA + d / 2, 0);
}

/**
 * Wrap a polyline's longitudes around the centre, splitting wherever a
 * consecutive pair would still span more than 180° (the wrap boundary).
 * Output parts NEVER contain such a segment — the invariant the
 * antimeridian test pins.
 */
export function wrapLine(line: readonly LonLat[], centerLon: number): LonLat[][] {
  const parts: LonLat[][] = [];
  let current: LonLat[] = [];
  let prev: LonLat | null = null;
  for (const [lon, lat] of line) {
    const w: LonLat = [wrapLon(lon, centerLon), lat];
    if (prev && Math.abs(w[0] - prev[0]) > 180) {
      if (current.length > 1) parts.push(current);
      current = [];
    }
    current.push(w);
    prev = w;
  }
  if (current.length > 1) parts.push(current);
  return parts;
}

export interface Projection {
  /** AFFINE only — expects a longitude already wrapped around centerLon
   *  (so ±360°-shifted land copies project to shifted positions instead of
   *  re-wrapping back onto the original). */
  x(wrappedLon: number): number;
  y(lat: number): number;
  centerLon: number;
  width: number;
  height: number;
}

/**
 * Equirectangular projection fitted to the points of interest with padding,
 * preserving the degree aspect. Every input point lands inside
 * [pad, width-pad] × [pad, height-pad]. Input points may be raw lon/lat
 * (they are wrapped here for the fit); the returned x() is deliberately
 * NOT wrapping — see Projection.
 */
export function makeProjection(
  points: readonly LonLat[],
  width: number,
  height: number,
  pad = 28,
  centerLon = 0,
): Projection {
  const lons = points.map(([lon]) => wrapLon(lon, centerLon));
  const lats = points.map(([, lat]) => lat);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const dLon = Math.max(maxLon - minLon, 5);
  const dLat = Math.max(maxLat - minLat, 5);
  const scale = Math.min((width - 2 * pad) / dLon, (height - 2 * pad) / dLat);
  const cx = (minLon + maxLon) / 2;
  const cy = (minLat + maxLat) / 2;
  return {
    x: (wrappedLon) => width / 2 + (wrappedLon - cx) * scale,
    y: (lat) => height / 2 - (lat - cy) * scale,
    centerLon,
    width,
    height,
  };
}

/** N-point great-circle interpolation (slerp) — the schematic fallback. */
export function greatCirclePoints(a: LonLat, b: LonLat, n = 48): LonLat[] {
  const rad = Math.PI / 180;
  const toVec = ([lon, lat]: LonLat): [number, number, number] => [
    Math.cos(lat * rad) * Math.cos(lon * rad),
    Math.cos(lat * rad) * Math.sin(lon * rad),
    Math.sin(lat * rad),
  ];
  const va = toVec(a);
  const vb = toVec(b);
  const dot = Math.min(1, Math.max(-1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const omega = Math.acos(dot);
  if (omega < 1e-9) return [a, b];
  const out: LonLat[] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const s1 = Math.sin((1 - t) * omega) / Math.sin(omega);
    const s2 = Math.sin(t * omega) / Math.sin(omega);
    const x = s1 * va[0] + s2 * vb[0];
    const y = s1 * va[1] + s2 * vb[1];
    const z = s1 * va[2] + s2 * vb[2];
    out.push([Math.atan2(y, x) / rad, Math.asin(z / Math.hypot(x, y, z)) / rad]);
  }
  return out;
}

/**
 * Raw longitude extent of a ring — deliberately UNWRAPPED. Natural Earth
 * rings are already continuous (polygons crossing ±180 are pre-split), so
 * wrapping their vertices around a corridor centre would tear any ring the
 * wrap boundary crosses into a horizontal streak. Instead the map draws
 * each ring at raw longitudes and places ±360°-shifted copies where they
 * intersect the view.
 */
export function lonExtent(ring: readonly LonLat[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const [lon] of ring) {
    if (lon < min) min = lon;
    if (lon > max) max = lon;
  }
  return [min, max];
}
