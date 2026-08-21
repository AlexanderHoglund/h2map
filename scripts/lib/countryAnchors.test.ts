import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { seaRoute } from "searoute-ts";
import { ROOT } from "./serviceDeps";
import {
  CURATED_ANCHORS,
  loadFeatures,
  renderCountryAnchorsModule,
} from "./countryAnchorsGen";
import { CORRIDOR_COUNTRIES } from "../../apps/web/lib/corridor-countries";
import {
  COUNTRY_ANCHORS,
  GENERATED_ANCHORS,
  anchorForCountry,
} from "../../apps/web/lib/corridor/countryAnchors";
import { SNAP_LIMIT_KM } from "../../apps/web/lib/seaRoute";

/**
 * Country port-area anchors — what makes "pick two countries, get a line
 * and a distance" safe to ship for all ~155 countries at once.
 *
 * The failure mode this guards: an anchor that LOOKS fine as a number but
 * sits too far from the marnet shipping-lane network, so the router's
 * SNAP_LIMIT_KM rejects it and the country silently degrades to the dashed
 * schematic. Nothing in a build or a typecheck would ever say so.
 *
 * Coverage (every slug resolves), determinism (regenerate-and-diff, the
 * artifact IS the computation), proximity (generated anchors hug a real NE
 * coastline), and routability (curated + inland anchors — the hand-typed
 * and the riskiest — actually route on the graph within the snap bound).
 */

const GEOJSON = `${ROOT}data/geo/ne_110m_countries.geojson`;
const EMITTED = `${ROOT}apps/web/lib/corridor/countryAnchors.ts`;

describe("coverage — every country select value has an anchor", () => {
  it("resolves every CORRIDOR_COUNTRIES slug", () => {
    const missing = CORRIDOR_COUNTRIES.filter((c) => !(c.value in COUNTRY_ANCHORS));
    expect(missing.map((c) => c.value), "countries with no anchor").toEqual([]);
  });

  it("every anchor is a plausible coordinate", () => {
    for (const [slug, a] of Object.entries(COUNTRY_ANCHORS)) {
      expect(Number.isFinite(a.lat) && Math.abs(a.lat) <= 90, `${slug} lat`).toBe(true);
      expect(Number.isFinite(a.lon) && Math.abs(a.lon) <= 180, `${slug} lon`).toBe(true);
    }
  });

  it("unknown ids resolve to no anchor (the map placeholder path)", () => {
    expect(anchorForCountry("other")).toBeUndefined();
    expect(anchorForCountry(undefined)).toBeUndefined();
    expect(anchorForCountry(null)).toBeUndefined();
  });
});

describe("determinism — the committed module is the computation's output", () => {
  it("regenerates byte-identically", () => {
    // Same guarantee CI's regenerate-and-diff gates give the sensitivity
    // artifacts: rerunning the generator against the committed geojson must
    // reproduce the committed module exactly — an edited-by-hand table or a
    // stale regeneration both fail here.
    expect(renderCountryAnchorsModule(GEOJSON)).toBe(readFileSync(EMITTED, "utf8"));
  });
});

describe("proximity — generated anchors sit on a real coastline", () => {
  // Point-to-segment distance in cos-scaled degree space (1 unit ≈ 111 km
  // everywhere) against the RAW Natural Earth rings, not the simplified
  // drawing module: the ~25 km seaward nudge is ~0.22°, so 0.5° means "the
  // vertex this anchor came from is really on the source coastline".
  const segments: [number, number, number, number][] = [];
  for (const f of loadFeatures(GEOJSON)) {
    for (const ring of f.rings) {
      for (let i = 0; i < ring.length; i += 1) {
        const [ax, ay] = ring[i]!;
        const [bx, by] = ring[(i + 1) % ring.length]!;
        segments.push([ax, ay, bx, by]);
      }
    }
  }

  function coastDistanceDeg(lat: number, lon: number): number {
    const cos = Math.cos((lat * Math.PI) / 180) || 1e-9;
    let best = Infinity;
    for (const [ax0, ay, bx0, by] of segments) {
      const ax = (ax0 - lon) * cos;
      const bx = (bx0 - lon) * cos;
      const dx = bx - ax;
      const dy = by - ay;
      const t = Math.max(
        0,
        Math.min(1, (-(ax * dx) - (ay - lat) * dy) / (dx * dx + dy * dy || 1e-12)),
      );
      const px = ax + t * dx;
      const py = ay - lat + t * dy;
      const d = px * px + py * py;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  it("every generated anchor is within 0.5 deg of an NE ring", () => {
    const offenders: string[] = [];
    for (const [slug, a] of Object.entries(GENERATED_ANCHORS)) {
      const d = coastDistanceDeg(a.lat, a.lon);
      if (d > 0.5) offenders.push(`${slug}: ${d.toFixed(2)} deg`);
    }
    expect(offenders, "anchors adrift from the source coastline").toEqual([]);
  });
});

describe("curated overrides win", () => {
  it("the merged table carries the curated value wherever both exist", () => {
    for (const [slug, a] of Object.entries(CURATED_ANCHORS)) {
      expect(COUNTRY_ANCHORS[slug], slug).toEqual({
        lat: a.lat,
        lon: a.lon,
        ...(a.inland ? { inland: true } : {}),
      });
    }
  });

  it("and the override is effective, not vacuous", () => {
    // Chile is in BOTH tables with different coordinates (geometric pick is
    // near Concepción; curated is the San Antonio approach) — proving the
    // spread order actually prefers curation.
    expect(GENERATED_ANCHORS["chile"]).toBeDefined();
    expect(COUNTRY_ANCHORS["chile"]).not.toEqual(GENERATED_ANCHORS["chile"]);
    expect(COUNTRY_ANCHORS["chile"]!.lat).toBe(-33.58);
  });
});

describe("routability — the snap bound never rejects an anchor", () => {
  // The riskiest anchors, routed for real on the marnet graph: every
  // CURATED one (hand-typed coordinates) and every inland one (a
  // neighbour's coast, farthest from home). The generated coastal rest are
  // covered by the 0.5° proximity bound above (≈55 km, a tenth of the
  // 500 km snap limit).
  const risky = Object.entries(COUNTRY_ANCHORS).filter(
    ([slug, a]) => slug in CURATED_ANCHORS || a.inland,
  );
  const rotterdam = CURATED_ANCHORS["netherlands"]!;
  const singapore = CURATED_ANCHORS["singapore"]!;

  it("routes every curated and inland anchor within SNAP_LIMIT_KM", { timeout: 120_000 }, () => {
    const failures: string[] = [];
    for (const [slug, a] of risky) {
      const to = slug === "netherlands" ? singapore : rotterdam;
      try {
        const f = seaRoute([a.lon, a.lat], [to.lon, to.lat], {
          units: "nauticalmiles",
          antimeridian: "split",
          maxSnapDistanceKm: SNAP_LIMIT_KM,
        });
        const snap = (f.properties as { originSnapKm?: number }).originSnapKm ?? 0;
        if (snap > SNAP_LIMIT_KM) failures.push(`${slug}: snap ${snap.toFixed(0)} km`);
      } catch (err) {
        failures.push(`${slug}: ${(err as Error).message}`);
      }
    }
    expect(failures, "anchors the router would reject").toEqual([]);
  });

  it("the country-level Chile → Japan corridor routes at the documented distance", { timeout: 30_000 }, () => {
    // The pair the app defaults to, from anchors alone — the figure the
    // Intro tab auto-fills for a country-only corridor (e2e asserts the
    // same number through the UI). Pinned safely: the graph version is
    // frozen (SEA_ROUTE_GRAPH_VERSION), so this moves only when the curated
    // anchors do.
    const chile = COUNTRY_ANCHORS["chile"]!;
    const japan = COUNTRY_ANCHORS["japan"]!;
    const f = seaRoute([chile.lon, chile.lat], [japan.lon, japan.lat], {
      units: "nauticalmiles",
      returnPassages: true,
      antimeridian: "split",
      maxSnapDistanceKm: SNAP_LIMIT_KM,
    });
    const props = f.properties as { length: number; passages?: string[] };
    expect(Math.round(props.length)).toBe(9555);
    // Trans-Pacific: no canal transit.
    expect(props.passages ?? []).not.toContain("panama");
    expect(props.passages ?? []).not.toContain("suez");
  });
});
