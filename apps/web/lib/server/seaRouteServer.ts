import {
  coordKey,
  SEA_ROUTE_GRAPH_VERSION,
  SNAP_LIMIT_KM,
  type CanalTransit,
  type SeaRouteError,
  type SeaRouteResult,
} from "../seaRoute";

/**
 * Server-side sea routing over the bundled marnet graph (searoute-ts,
 * pinned exact — the wrapper is deliberately thin so the library stays
 * swappable behind SeaRouteResult). Fully local: the graph ships in the
 * package, no network call to any third party, so a routing "outage" is
 * impossible by construction. Deterministic Dijkstra over a fixed graph:
 * same ports in, same route out — which is why the module-scope cache
 * (precedent: corridorRef.ts) is sound.
 */

const cache = new Map<string, SeaRouteResult | { failed: SeaRouteError }>();

/** The chart-worthy canal subset of marnet's named passages. */
const CANALS: readonly CanalTransit[] = ["panama", "suez"];

export type RouteSeaOutcome =
  | { ok: true; route: SeaRouteResult }
  | { ok: false; error: SeaRouteError };

export async function routeSea(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): Promise<RouteSeaOutcome> {
  const key = `${coordKey(from.lat, from.lon)}|${coordKey(to.lat, to.lon)}`;
  const hit = cache.get(key);
  if (hit) {
    return "failed" in hit ? { ok: false, error: hit.failed } : { ok: true, route: hit };
  }

  try {
    // Lazy import: the graph (~1.2 MB) loads on first use, server-side only.
    const { seaRoute } = await import("searoute-ts");
    const feature = seaRoute([from.lon, from.lat], [to.lon, to.lat], {
      units: "nauticalmiles",
      returnPassages: true,
      antimeridian: "split",
      maxSnapDistanceKm: SNAP_LIMIT_KM,
    });
    const props = feature.properties as {
      length: number;
      passages?: string[];
      originSnapKm?: number;
      destinationSnapKm?: number;
    };
    const snapOrigin = props.originSnapKm ?? 0;
    const snapDest = props.destinationSnapKm ?? 0;
    // Belt and braces over the library option: a snap past the bound is a
    // routing failure (degraded state), never a confidently wrong route.
    if (snapOrigin > SNAP_LIMIT_KM || snapDest > SNAP_LIMIT_KM) {
      cache.set(key, { failed: "snap_failed" });
      return { ok: false, error: "snap_failed" };
    }
    const geometry =
      feature.geometry.type === "MultiLineString"
        ? (feature.geometry as SeaRouteResult["geometry"])
        : // antimeridian:"split" promises MultiLineString, but normalise a
          // LineString defensively rather than trusting the type forever.
          {
            type: "MultiLineString" as const,
            coordinates: [
              (feature.geometry as unknown as { coordinates: number[][] }).coordinates,
            ],
          };
    const passages = props.passages ?? [];
    const route: SeaRouteResult = {
      nm: props.length,
      geometry,
      via: CANALS.find((c) => passages.includes(c)) ?? null,
      passages,
      snapKm: { origin: snapOrigin, destination: snapDest },
      graphVersion: SEA_ROUTE_GRAPH_VERSION,
    };
    cache.set(key, route);
    return { ok: true, route };
  } catch (err) {
    // Typed failures degrade; anything else degrades too — routing must
    // never block the model or the drawing.
    let error: SeaRouteError = "routing_failed";
    try {
      const { SnapFailedError } = await import("searoute-ts");
      if (err instanceof SnapFailedError) error = "snap_failed";
    } catch {
      /* import failed — keep routing_failed */
    }
    cache.set(key, { failed: error });
    return { ok: false, error };
  }
}
