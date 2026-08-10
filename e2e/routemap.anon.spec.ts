/**
 * Pure tests for the route-map geometry (sprint 3.3b): the antimeridian
 * invariant — no drawn segment spans more than 180° of longitude — on both
 * a synthetic Pacific crossing and the real reference route, plus
 * projection fit and great-circle interpolation sanity. Browserless.
 */

import { expect, test } from "@playwright/test";
import {
  corridorCenterLon,
  greatCirclePoints,
  makeProjection,
  wrapLine,
  wrapLon,
  type LonLat,
} from "../apps/web/lib/routeMapGeometry";
import { routeSea } from "../apps/web/lib/server/seaRouteServer";

const MEJILLONES: LonLat = [-70.44, -23.1];
const YOKOHAMA: LonLat = [139.65, 35.45];

function assertNoWideSegments(parts: LonLat[][]) {
  for (const part of parts) {
    for (let i = 1; i < part.length; i += 1) {
      expect(Math.abs(part[i]![0] - part[i - 1]![0])).toBeLessThanOrEqual(180);
    }
  }
}

test("wrapping splits a synthetic Pacific crossing cleanly", () => {
  const center = corridorCenterLon(MEJILLONES[0], YOKOHAMA[0]);
  // The corridor centre sits in the Pacific, not the Atlantic.
  expect(Math.abs(center)).toBeGreaterThan(140);
  const line: LonLat[] = [
    [-70, -20],
    [-120, 0],
    [-170, 15],
    [175, 25], // crosses the date line
    [140, 35],
  ];
  const parts = wrapLine(line, center);
  // Around a Pacific centre the line is contiguous — one part, no split…
  expect(parts.length).toBe(1);
  assertNoWideSegments(parts);
  // …while around Greenwich the same line must split at the boundary.
  assertNoWideSegments(wrapLine(line, 0));
});

test("the real reference route renders without a spanning segment", async () => {
  const outcome = await routeSea(
    { lat: MEJILLONES[1], lon: MEJILLONES[0] },
    { lat: YOKOHAMA[1], lon: YOKOHAMA[0] },
  );
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  const center = corridorCenterLon(MEJILLONES[0], YOKOHAMA[0]);
  const parts = outcome.route.geometry.coordinates.flatMap((line) =>
    wrapLine(line.map((p) => [p[0]!, p[1]!] as LonLat), center),
  );
  expect(parts.length).toBeGreaterThan(0);
  assertNoWideSegments(parts);
});

test("the projection places every point of interest inside the frame", () => {
  const center = corridorCenterLon(MEJILLONES[0], YOKOHAMA[0]);
  const poi = [MEJILLONES, YOKOHAMA, ...greatCirclePoints(MEJILLONES, YOKOHAMA, 32)];
  const proj = makeProjection(poi, 720, 300, 30, center);
  for (const [lon, lat] of poi) {
    const x = proj.x(wrapLon(lon, center));
    const y = proj.y(lat);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(720);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(300);
  }
});

test("great-circle interpolation hits its endpoints and stays smooth", () => {
  const pts = greatCirclePoints(MEJILLONES, YOKOHAMA, 48);
  expect(pts[0]![0]).toBeCloseTo(MEJILLONES[0], 4);
  expect(pts[0]![1]).toBeCloseTo(MEJILLONES[1], 4);
  expect(pts[pts.length - 1]![1]).toBeCloseTo(YOKOHAMA[1], 4);
  // Longitude of the endpoint may come back wrapped — compare on the circle.
  const dLon = Math.abs(wrapLon(pts[pts.length - 1]![0] - YOKOHAMA[0], 0));
  expect(dLon).toBeLessThan(1e-4);
});
