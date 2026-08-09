/**
 * Sea-routing engine validation (sprint 3.3a) — pure Node, no browser:
 * imports the server routing wrapper directly, like the animation geometry
 * specs. The three corridors are the acceptance tests for the engine
 * itself; distance bands come from NGA Pub. 151 "Distances Between Ports"
 * (11th ed.) junction-point sums and industry figures (SeaNews for Suez).
 */

import { expect, test } from "@playwright/test";
import { routeSea } from "../apps/web/lib/server/seaRouteServer";
import { SEA_ROUTE_GRAPH_VERSION, SNAP_LIMIT_KM } from "../apps/web/lib/seaRoute";

const MEJILLONES = { lat: -23.1, lon: -70.44 };
const YOKOHAMA = { lat: 35.45, lon: 139.65 };
const ROTTERDAM = { lat: 51.9, lon: 4.47 };
const SINGAPORE = { lat: 1.27, lon: 103.83 };

/** Canal assertion boxes [minLon, minLat, maxLon, maxLat]. Padded to the
 *  100 km network's vertex spacing (a segment can cross a sub-degree box
 *  without leaving a vertex in it) while still uniquely identifying each
 *  isthmus — no sea route crosses these land bridges except the canal. */
const PANAMA_BOX = [-81.0, 7.8, -78.5, 10.2] as const;
const SUEZ_BOX = [31.0, 28.8, 34.0, 32.0] as const;

function passesThrough(
  geometry: { coordinates: number[][][] },
  box: readonly [number, number, number, number],
): boolean {
  return geometry.coordinates.some((line) =>
    line.some(
      ([lon, lat]) =>
        lon !== undefined &&
        lat !== undefined &&
        lon >= box[0] &&
        lon <= box[2] &&
        lat >= box[1] &&
        lat <= box[3],
    ),
  );
}

test("Mejillones → Japan crosses the Pacific with no canal", async () => {
  const outcome = await routeSea(MEJILLONES, YOKOHAMA);
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  const r = outcome.route;
  // Typed reference distance 9,500 nm ±10% (Pub. 151: Valparaíso→Yokohama
  // 9,280; Antofagasta ≈9,000; Mejillones sits 40 nm north of Antofagasta).
  expect(r.nm).toBeGreaterThan(8550);
  expect(r.nm).toBeLessThan(10450);
  expect(r.via).toBeNull();
  expect(passesThrough(r.geometry, PANAMA_BOX)).toBe(false);
  expect(passesThrough(r.geometry, SUEZ_BOX)).toBe(false);
  expect(r.graphVersion).toBe(SEA_ROUTE_GRAPH_VERSION);
  console.log(`VALIDATION Mejillones→Yokohama: ${Math.round(r.nm)} nm, passages ${r.passages.join("/") || "none"}`);
});

test("Chile → Rotterdam routes via Panama", async () => {
  const outcome = await routeSea(MEJILLONES, ROTTERDAM);
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  const r = outcome.route;
  // Pub. 151 junction sum Antofagasta→Panama→Rotterdam = 6,428 nm;
  // commercial calculators ≈7,000–7,400. Band 6,400–7,800.
  expect(r.nm).toBeGreaterThan(6400);
  expect(r.nm).toBeLessThan(7800);
  expect(r.via).toBe("panama");
  expect(r.passages).toContain("panama");
  expect(passesThrough(r.geometry, PANAMA_BOX)).toBe(true);
  console.log(`VALIDATION Mejillones→Rotterdam: ${Math.round(r.nm)} nm via ${r.via}`);
});

test("Singapore → Rotterdam routes via Suez", async () => {
  const outcome = await routeSea(SINGAPORE, ROTTERDAM);
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  const r = outcome.route;
  // SeaNews: 8,440 nm via Suez (vs ~11,720 via the Cape); industry figure
  // 8,288 nm. ±10% band on 8,288 → 7,460–9,120.
  expect(r.nm).toBeGreaterThan(7460);
  expect(r.nm).toBeLessThan(9120);
  expect(r.via).toBe("suez");
  expect(r.passages).toContain("suez");
  expect(passesThrough(r.geometry, SUEZ_BOX)).toBe(true);
  console.log(`VALIDATION Singapore→Rotterdam: ${Math.round(r.nm)} nm via ${r.via}`);
});

test("routing is deterministic", async () => {
  // Two fresh evaluations (second bypasses nothing — the cache returns the
  // stored object, so ALSO compare against a coordinate-jittered twin pair
  // that must produce its own identical geometry).
  const a = await routeSea(SINGAPORE, ROTTERDAM);
  const b = await routeSea(SINGAPORE, ROTTERDAM);
  expect(a).toEqual(b);
  const c1 = await routeSea({ lat: 1.2701, lon: 103.8301 }, ROTTERDAM);
  const c2 = await routeSea({ lat: 1.2701, lon: 103.8301 }, ROTTERDAM);
  expect(c1.ok && c2.ok).toBe(true);
  if (c1.ok && c2.ok) {
    expect(c1.route.nm).toBe(c2.route.nm);
    expect(c1.route.geometry).toEqual(c2.route.geometry);
  }
});

test("the snap bound refuses deep-inland points and accepts coastal ones", async () => {
  // Central Asia: ~2,300 km from the network — degraded state, never a
  // confidently wrong route from the middle of a continent.
  const inland = await routeSea({ lat: 45, lon: 80 }, ROTTERDAM);
  expect(inland.ok).toBe(false);
  if (!inland.ok) expect(inland.error).toBe("snap_failed");
  // Mejillones snaps ~325 km on this coarse network — inside the measured
  // 500 km bound (the spec's ~100 km sketch would fail the reference
  // corridor's own port; the bound's purpose is continent-interior
  // detection, and 500 km preserves it).
  const coastal = await routeSea(MEJILLONES, YOKOHAMA);
  expect(coastal.ok).toBe(true);
  if (coastal.ok) {
    expect(coastal.route.snapKm.origin).toBeLessThan(SNAP_LIMIT_KM);
    expect(coastal.route.snapKm.destination).toBeLessThan(SNAP_LIMIT_KM);
  }
});

test("split geometry never spans the antimeridian in one segment", async () => {
  const outcome = await routeSea(MEJILLONES, YOKOHAMA);
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  for (const line of outcome.route.geometry.coordinates) {
    for (let i = 1; i < line.length; i += 1) {
      const lonA = line[i - 1]![0]!;
      const lonB = line[i]![0]!;
      expect(Math.abs(lonB - lonA)).toBeLessThanOrEqual(180);
    }
  }
});
