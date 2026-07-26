/**
 * Risk-adjusted cost of capital per cell (P1 #5). The map's default layer uses
 * a single uniform WACC so it ranks *resource*; this resolver assigns each cell
 * the financing cost of the country it falls in, so the risk-adjusted layer
 * ranks *project cost*. Capital recovery over 20 yr runs 0.087→0.134 as WACC
 * goes 6→12 %, a larger swing than the resource spread between good sites, so
 * this is the single largest lever on decision value in the tool.
 *
 * Country match: point-in-polygon against the committed Natural Earth 110m
 * boundaries (the same set the seeder draws and `defaults:ingest` keys on).
 * WACC: `country_defaults.wacc_suggestion` — a transparent World Bank
 * income-group HEURISTIC (0.06 OECD-high → 0.12 low-income), not measured
 * cost-of-capital. It is deliberately isolated here so a better source (e.g.
 * per-country risk premia) can be swapped in without touching the sweep.
 */
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ROOT } from "./serviceDeps";

/** Uniform reference WACC — the default resource-driven financing layer. */
export const UNIFORM_WACC = 0.08;

export interface WaccResolution {
  wacc: number;
  iso2: string | null;
  /** `country-heuristic` when a country matched; `uniform-default` otherwise. */
  source: "country-heuristic" | "uniform-default";
}

type Ring = [number, number][]; // [lon, lat]
interface CountryPoly {
  iso2: string;
  bbox: [number, number, number, number]; // minLon, minLat, maxLon, maxLat
  polygons: Ring[][]; // each polygon = [outerRing, ...holes]
}

interface NeFeature {
  properties: { ISO_A2: string; ISO_A2_EH: string; CONTINENT: string };
  geometry: { type: string; coordinates: unknown };
}

function pickIso(p: NeFeature["properties"]): string | null {
  for (const v of [p.ISO_A2_EH, p.ISO_A2]) if (v && v !== "-99") return v;
  return null;
}

function ringsToBbox(polygons: Ring[][]): [number, number, number, number] {
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

function normalizeGeometry(geom: NeFeature["geometry"]): Ring[][] {
  if (geom.type === "Polygon") return [geom.coordinates as Ring[]];
  if (geom.type === "MultiPolygon") return geom.coordinates as Ring[][];
  return [];
}

/** Even–odd ray cast across every ring of a polygon (so holes exclude). */
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

export interface WaccResolver {
  resolve(lat: number, lon: number): WaccResolution;
  /** Countries loaded with a WACC, for reporting. */
  readonly countryCount: number;
}

export async function makeWaccResolver(db: SupabaseClient): Promise<WaccResolver> {
  const { data, error } = await db
    .from("country_defaults")
    .select("iso2, wacc_suggestion");
  if (error) throw new Error(error.message);
  const waccByIso = new Map<string, number>(
    (data ?? []).map((r) => [r.iso2 as string, Number(r.wacc_suggestion)]),
  );

  const gj = JSON.parse(
    readFileSync(`${ROOT}data/geo/ne_110m_countries.geojson`, "utf8"),
  ) as { features: NeFeature[] };

  const countries: CountryPoly[] = [];
  for (const f of gj.features) {
    if (f.properties.CONTINENT === "Antarctica") continue;
    const iso2 = pickIso(f.properties);
    if (!iso2 || !waccByIso.has(iso2)) continue;
    const polygons = normalizeGeometry(f.geometry);
    if (polygons.length === 0) continue;
    countries.push({ iso2, polygons, bbox: ringsToBbox(polygons) });
  }

  return {
    countryCount: countries.length,
    resolve(lat: number, lon: number): WaccResolution {
      for (const c of countries) {
        const [minLon, minLat, maxLon, maxLat] = c.bbox;
        if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;
        for (const poly of c.polygons) {
          if (inPolygon(lon, lat, poly)) {
            return { wacc: waccByIso.get(c.iso2)!, iso2: c.iso2, source: "country-heuristic" };
          }
        }
      }
      return { wacc: UNIFORM_WACC, iso2: null, source: "uniform-default" };
    },
  };
}
