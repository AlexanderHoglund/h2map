import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Reverse-geocode a coordinate to an ISO2 country code by point-in-polygon
 * against the committed Natural Earth 110m boundaries — the same set the map
 * seeder and the WACC layer key on. Used to auto-apply a location's country
 * defaults when a cell is evaluated. The parsed polygon index is built once and
 * cached in module scope.
 */

type Ring = [number, number][]; // [lon, lat]
interface CountryPoly {
  iso2: string;
  bbox: [number, number, number, number]; // minLon, minLat, maxLon, maxLat
  polygons: Ring[][];
}
interface NeFeature {
  properties: { ISO_A2: string; ISO_A2_EH: string; CONTINENT: string };
  geometry: { type: string; coordinates: unknown };
}

let cache: CountryPoly[] | null = null;

/** data/ lives at the repo root; dev cwd is apps/web, prod may differ. */
function geojsonPath(): string | null {
  for (const candidate of [
    path.resolve(process.cwd(), "data/geo/ne_110m_countries.geojson"),
    path.resolve(process.cwd(), "../../data/geo/ne_110m_countries.geojson"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function pickIso(p: NeFeature["properties"]): string | null {
  for (const v of [p.ISO_A2_EH, p.ISO_A2]) if (v && v !== "-99") return v;
  return null;
}

function normalizeGeometry(geom: NeFeature["geometry"]): Ring[][] {
  if (geom.type === "Polygon") return [geom.coordinates as Ring[]];
  if (geom.type === "MultiPolygon") return geom.coordinates as Ring[][];
  return [];
}

function bboxOf(polygons: Ring[][]): [number, number, number, number] {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const poly of polygons)
    for (const [lon, lat] of poly[0]!) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  return [minLon, minLat, maxLon, maxLat];
}

/** Even–odd ray cast across every ring of a polygon (holes exclude). */
function inPolygon(lon: number, lat: number, polygon: Ring[]): boolean {
  let inside = false;
  for (const ring of polygon) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      const intersects =
        yi > lat !== yj > lat &&
        lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (intersects) inside = !inside;
    }
  }
  return inside;
}

function load(): CountryPoly[] {
  if (cache) return cache;
  const file = geojsonPath();
  if (!file) {
    cache = [];
    return cache;
  }
  const gj = JSON.parse(readFileSync(file, "utf8")) as { features: NeFeature[] };
  const out: CountryPoly[] = [];
  for (const f of gj.features) {
    if (f.properties.CONTINENT === "Antarctica") continue;
    const iso2 = pickIso(f.properties);
    if (!iso2) continue;
    const polygons = normalizeGeometry(f.geometry);
    if (polygons.length === 0) continue;
    out.push({ iso2, polygons, bbox: bboxOf(polygons) });
  }
  cache = out;
  return cache;
}

/** ISO2 of the country containing (lat, lon), or null (ocean / unavailable). */
export function countryAt(lat: number, lon: number): string | null {
  for (const c of load()) {
    const [minLon, minLat, maxLon, maxLat] = c.bbox;
    if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;
    for (const poly of c.polygons) if (inPolygon(lon, lat, poly)) return c.iso2;
  }
  return null;
}
