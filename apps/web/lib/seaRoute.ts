/**
 * Sea-routing contract shared by the client (drawing, distance field) and
 * the server route handler. The route is computed over Eurostat's marnet
 * shipping-lane network — screening-grade ("indicative"), not a voyage
 * plan: the 100 km graph lands within roughly ±5–10% of published tables
 * and the polyline may cut close to coasts.
 */

/** Provenance pin for routed distances: wrapper package + network. A graph
 *  update is a NEW version string, never an in-place overwrite — stored
 *  routed distances stay reproducible. */
export const SEA_ROUTE_GRAPH_VERSION = "searoute-ts@2.2.0/marnet-plus-100km";

/**
 * Snap sanity bound, km. The spec sketched ~100 km, but that misreads this
 * network's measured coarseness: marnet-100km's lanes run far enough
 * offshore that Mejillones — the reference corridor's own port — snaps
 * 325 km. The bound's PURPOSE is to refuse a confidently wrong route from
 * the middle of a continent (central Asia measures ~2,300 km); 500 km
 * keeps that property while accepting real coastal ports on this graph.
 */
export const SNAP_LIMIT_KM = 500;

export type CanalTransit = "panama" | "suez";

export interface SeaRouteResult {
  /** One-way routed length, nautical miles. */
  nm: number;
  /** RFC 7946 antimeridian-split geometry — no segment crosses ±180°. */
  geometry: { type: "MultiLineString"; coordinates: number[][][] };
  /** Canal the route transits, if any (the chart-worthy subset). */
  via: CanalTransit | null;
  /** Every named passage the route uses (dover, malacca, …). */
  passages: string[];
  /** How far each end had to snap to reach the network, km. */
  snapKm: { origin: number; destination: number };
  graphVersion: string;
}

export type SeaRouteError = "snap_failed" | "routing_failed";

export interface SeaRouteResponse {
  ok: boolean;
  route?: SeaRouteResult;
  error?: SeaRouteError;
}

/** Cache/request key: 4-dp coordinates (~11 m) — stable, deterministic. */
export function coordKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}
