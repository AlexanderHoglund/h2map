/**
 * The endless continuation of the seeding ladder: every country on Earth,
 * depth-first (res 2 → 3, plus res 4 for small countries), ordered
 * smallest-first so many countries complete early. Boundaries come from
 * Natural Earth 110m (public domain), committed at
 * data/geo/ne_110m_countries.geojson.
 */
import { readFileSync } from "node:fs";
import { polygonToCells } from "h3-js";
import { ROOT } from "../lib/serviceDeps";

interface CountryFeature {
  properties: { NAME: string; CONTINENT: string };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

export interface WorldCountry {
  name: string;
  /** ≤ 9 res-2 cells (~800k km²) — small enough to deserve res 4. */
  small: boolean;
  cells: (res: number) => string[];
}

function cellsForFeature(f: CountryFeature, res: number): string[] {
  const polygons =
    f.geometry.type === "Polygon"
      ? [f.geometry.coordinates as number[][][]]
      : (f.geometry.coordinates as number[][][][]);
  const out: string[] = [];
  for (const polygon of polygons) {
    try {
      // GeoJSON coordinate order ([lng, lat]) via the isGeoJSON flag.
      out.push(...polygonToCells(polygon, res, true));
    } catch {
      // Degenerate ring (tiny island artifacts) — skip this polygon.
    }
  }
  return [...new Set(out)];
}

export function loadWorldProgram(): WorldCountry[] {
  const gj = JSON.parse(
    readFileSync(`${ROOT}data/geo/ne_110m_countries.geojson`, "utf8"),
  ) as { features: CountryFeature[] };

  return gj.features
    .filter(
      (f) =>
        f.properties.CONTINENT !== "Antarctica" &&
        f.properties.CONTINENT !== "Seven seas (open ocean)",
    )
    .map((f) => {
      const res2Count = cellsForFeature(f, 2).length;
      return {
        name: f.properties.NAME,
        small: res2Count <= 9,
        size: res2Count,
        cells: (res: number) => cellsForFeature(f, res),
      };
    })
    .sort((a, b) => a.size - b.size)
    .map(({ name, small, cells }) => ({ name, small, cells }));
}
