/**
 * Country port-area anchors — the computation behind
 * `scripts/geo/gen-country-anchors.ts` (which writes
 * `apps/web/lib/corridor/countryAnchors.ts`), extracted here so the
 * regenerate-and-diff test can recompute the module in-process and require
 * the committed artifact byte-for-byte (house pattern: sweepParams,
 * uncertaintyRun).
 *
 * WHAT AN ANCHOR IS. One representative "port area" coordinate per
 * CORRIDOR_COUNTRIES slug — country-level screening, NOT a specific port:
 * picking two countries on the Intro tab is enough to draw the corridor and
 * route a sea distance; typed coordinates always overwrite it. Derivation,
 * per country (Natural Earth 110m, `ADMIN`/`LABEL_X`/`LABEL_Y`):
 *
 *  - COASTAL: the densest coastal ring's vertex nearest the country's
 *    label point, nudged ~25 km seaward so the marnet snap never starts
 *    from dry land. "Coastal" = a ring vertex NO other country shares —
 *    shared vertices are land borders (NE 110m is topologically clean at
 *    2-dp precision, verified by the generator's own coverage).
 *  - LANDLOCKED (no coastal vertex): the nearest coastal vertex of any
 *    neighbouring polygon — the "nearest reasonable port area" — flagged
 *    `inland: true`.
 *  - CASPIAN shores count as land here, not coast: the routing graph is
 *    the OCEAN shipping-lane network, and a Caspian anchor would fail its
 *    500 km snap bound with certainty (Baku to the Black Sea is ~700 km
 *    overland). Caspian-only countries take the landlocked path.
 *  - CURATED overrides win last: micro-states below the 110m resolution
 *    (Singapore, Malta, the atolls...) plus majors where a named approach
 *    beats the geometric pick (Rotterdam, Tokyo Bay...).
 */

import { readFileSync } from "node:fs";
import { CORRIDOR_COUNTRIES } from "../../apps/web/lib/corridor-countries";

export interface CountryAnchor {
  lat: number;
  lon: number;
  /** Landlocked country: the anchor is a neighbour's coast, not its own. */
  inland?: true;
}

type LonLat = [number, number];

/** CORRIDOR_COUNTRIES slugs whose Natural Earth ADMIN name differs. */
export const NE_ADMIN_ALIASES: Record<string, string> = {
  bahamas: "The Bahamas",
  tanzania: "United Republic of Tanzania",
  "timor-leste": "East Timor",
  "united-states": "United States of America",
};

/**
 * Hand-curated anchors — they OVERRIDE the generated ones. Two classes:
 * countries absent from NE 110m entirely (no polygon to derive from), and
 * majors/awkward cases where a named port approach is simply better than
 * the geometric pick. Every coordinate is a harbour approach / roadstead,
 * slightly offshore. `inland` marks countries whose own coast the ocean
 * network cannot serve (Caspian-only states anchor to their actual export
 * corridors).
 */
export const CURATED_ANCHORS: Record<string, CountryAnchor & { note: string }> = {
  // -- majors: a named approach beats the geometric pick -------------------
  chile: { lat: -33.58, lon: -71.65, note: "San Antonio / Valparaiso approach" },
  japan: { lat: 34.9, lon: 139.75, note: "Tokyo Bay approach (Uraga Channel)" },
  netherlands: { lat: 51.98, lon: 3.95, note: "Rotterdam Maasgeul approach" },
  australia: { lat: -20.25, lon: 118.58, note: "Port Hedland approach (geometric pick is the portless Nullarbor coast)" },
  canada: { lat: 44.6, lon: -63.48, note: "Halifax approach (geometric pick is Hudson Bay)" },
  // -- 110m geometry mispicks: a short coast collapses to shared border
  // -- vertices, so the generator wrongly routes these to a neighbour ------
  belgium: { lat: 51.37, lon: 3.2, note: "Zeebrugge approach" },
  benin: { lat: 6.3, lon: 2.44, note: "Cotonou roadstead" },
  gambia: { lat: 13.5, lon: -16.75, note: "Banjul approach" },
  iraq: { lat: 29.8, lon: 48.6, note: "Umm Qasr / Khor Abdullah approach" },
  jordan: { lat: 29.45, lon: 34.95, note: "Aqaba approach" },
  lithuania: { lat: 55.72, lon: 21.05, note: "Klaipeda approach" },
  slovenia: { lat: 45.57, lon: 13.68, note: "Koper approach" },
  togo: { lat: 6.1, lon: 1.28, note: "Lome roadstead" },
  // -- Caspian-only: anchored to the actual export corridor ----------------
  kazakhstan: { lat: 44.62, lon: 37.75, inland: true, note: "Novorossiysk (CPC corridor; geometric pick is the Gulf of Ob)" },
  // -- below NE 110m resolution: no polygon exists to derive from ---------
  singapore: { lat: 1.22, lon: 103.85, note: "Singapore Strait anchorage" },
  bahrain: { lat: 26.2, lon: 50.68, note: "Khalifa Bin Salman approach" },
  barbados: { lat: 13.1, lon: -59.64, note: "Bridgetown Deep Water Harbour" },
  "cabo-verde": { lat: 16.9, lon: -25.0, note: "Porto Grande, Mindelo" },
  comoros: { lat: -11.69, lon: 43.24, note: "Moroni roadstead" },
  grenada: { lat: 12.05, lon: -61.76, note: "St George's" },
  kiribati: { lat: 1.36, lon: 172.93, note: "Betio, Tarawa" },
  maldives: { lat: 4.18, lon: 73.5, note: "Male" },
  malta: { lat: 35.89, lon: 14.54, note: "Valletta Grand Harbour" },
  "marshall-islands": { lat: 7.11, lon: 171.37, note: "Majuro" },
  mauritius: { lat: -20.15, lon: 57.49, note: "Port Louis" },
  micronesia: { lat: 6.98, lon: 158.21, note: "Pohnpei (Kolonia)" },
  monaco: { lat: 43.73, lon: 7.43, note: "Port Hercule" },
  nauru: { lat: -0.53, lon: 166.91, note: "Aiwo roadstead" },
  palau: { lat: 7.33, lon: 134.47, note: "Malakal Harbor, Koror" },
  "saint-kitts-and-nevis": { lat: 17.29, lon: -62.72, note: "Basseterre" },
  "saint-lucia": { lat: 14.02, lon: -61.0, note: "Castries" },
  "saint-vincent-and-the-grenadines": { lat: 13.15, lon: -61.24, note: "Kingstown" },
  samoa: { lat: -13.82, lon: -171.76, note: "Apia" },
  seychelles: { lat: -4.62, lon: 55.47, note: "Port Victoria" },
  tonga: { lat: -21.13, lon: -175.18, note: "Nuku'alofa" },
  tuvalu: { lat: -8.52, lon: 179.2, note: "Funafuti" },
};

/** ~1° of latitude in km (equirectangular screening math throughout). */
const KM_PER_DEG = 111.2;
/** Seaward nudge so anchors start wet, not on the beach vertex itself. */
const NUDGE_KM = 25;
/**
 * The Caspian Sea's bounding box (lon/lat). Vertices inside are treated as
 * LAND BORDER, not coast — see the module docblock.
 */
const CASPIAN = { lonMin: 45.5, lonMax: 55.5, latMin: 36.0, latMax: 47.5 };

interface Feature {
  admin: string;
  label: LonLat;
  /** Outer rings only — holes are lakes, never coast for our purposes. */
  rings: LonLat[][];
}

interface GeoJson {
  features: {
    properties: { ADMIN: string; LABEL_X: number; LABEL_Y: number };
    geometry: { type: string; coordinates: unknown };
  }[];
}

export function loadFeatures(geojsonPath: string): Feature[] {
  const gj = JSON.parse(readFileSync(geojsonPath, "utf8")) as GeoJson;
  return gj.features.map((f) => {
    const g = f.geometry;
    const polys =
      g.type === "Polygon"
        ? [g.coordinates as LonLat[][]]
        : g.type === "MultiPolygon"
          ? (g.coordinates as LonLat[][][])
          : [];
    return {
      admin: f.properties.ADMIN,
      label: [f.properties.LABEL_X, f.properties.LABEL_Y],
      rings: polys.map((p) => p[0]!).filter(Boolean),
    };
  });
}

/** 2-dp vertex key (~1 km) — NE 110m borders share vertices at this scale. */
const vkey = ([lon, lat]: LonLat) => `${lon.toFixed(2)},${lat.toFixed(2)}`;

const inCaspian = ([lon, lat]: LonLat) =>
  lon >= CASPIAN.lonMin && lon <= CASPIAN.lonMax && lat >= CASPIAN.latMin && lat <= CASPIAN.latMax;

/** Equirectangular km distance — screening-grade, deterministic. */
function kmDist(a: LonLat, b: LonLat): number {
  const dx = (a[0] - b[0]) * KM_PER_DEG * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  const dy = (a[1] - b[1]) * KM_PER_DEG;
  return Math.hypot(dx, dy);
}

/** Nudge a coastal vertex ~25 km seaward: directly away from the label
 *  point (the country's interior), the cheapest robust "off the beach". */
function nudgeSeaward(vertex: LonLat, label: LonLat): LonLat {
  const cos = Math.cos((vertex[1] * Math.PI) / 180) || 1e-9;
  const dxKm = (vertex[0] - label[0]) * KM_PER_DEG * cos;
  const dyKm = (vertex[1] - label[1]) * KM_PER_DEG;
  const len = Math.hypot(dxKm, dyKm) || 1;
  return [
    vertex[0] + ((dxKm / len) * NUDGE_KM) / (KM_PER_DEG * cos),
    vertex[1] + ((dyKm / len) * NUDGE_KM) / KM_PER_DEG,
  ];
}

export interface GeneratedAnchors {
  /** slug → anchor, in CORRIDOR_COUNTRIES order (deterministic emit). */
  anchors: Record<string, CountryAnchor>;
  /** Slugs with no NE polygon — they MUST be curated. */
  missingFromNe: string[];
}

export function computeGeneratedAnchors(geojsonPath: string): GeneratedAnchors {
  const features = loadFeatures(geojsonPath);
  const byAdmin = new Map(features.map((f) => [f.admin, f]));

  // A vertex shared by two features is a land border; unique = coast.
  const owners = new Map<string, Set<string>>();
  for (const f of features) {
    for (const ring of f.rings) {
      for (const v of ring) {
        const k = vkey(v);
        let set = owners.get(k);
        if (!set) owners.set(k, (set = new Set()));
        set.add(f.admin);
      }
    }
  }
  const isCoastal = (v: LonLat) => owners.get(vkey(v))!.size === 1 && !inCaspian(v);

  const coastalOf = (f: Feature): LonLat[][] =>
    f.rings.map((ring) => ring.filter(isCoastal));

  const neighboursOf = (f: Feature): Feature[] => {
    const shared = new Set<string>();
    for (const ring of f.rings) {
      for (const v of ring) {
        for (const admin of owners.get(vkey(v))!) {
          if (admin !== f.admin) shared.add(admin);
        }
      }
    }
    return [...shared].map((a) => byAdmin.get(a)!).filter(Boolean);
  };

  const anchors: Record<string, CountryAnchor> = {};
  const missingFromNe: string[] = [];

  for (const { value: slug, label: name } of CORRIDOR_COUNTRIES) {
    const admin = NE_ADMIN_ALIASES[slug] ?? name;
    const feature = byAdmin.get(admin);
    if (!feature) {
      missingFromNe.push(slug);
      continue;
    }

    const coastalRings = coastalOf(feature).filter((r) => r.length > 0);
    if (coastalRings.length > 0) {
      // Densest coastal ring (the mainland, in practice), then its vertex
      // nearest the label point.
      const ring = coastalRings.reduce((best, r) => (r.length > best.length ? r : best));
      const vertex = ring.reduce((best, v) =>
        kmDist(v, feature.label) < kmDist(best, feature.label) ? v : best,
      );
      const [lon, lat] = nudgeSeaward(vertex, feature.label);
      anchors[slug] = { lat: round2(lat), lon: round2(lon) };
      continue;
    }

    // Landlocked: nearest coastal vertex of any neighbouring polygon.
    let best: { v: LonLat; from: Feature } | null = null;
    for (const nb of neighboursOf(feature)) {
      for (const ring of coastalOf(nb)) {
        for (const v of ring) {
          if (!best || kmDist(v, feature.label) < kmDist(best.v, feature.label)) {
            best = { v, from: nb };
          }
        }
      }
    }
    if (!best) {
      missingFromNe.push(slug);
      continue;
    }
    const [lon, lat] = nudgeSeaward(best.v, best.from.label);
    anchors[slug] = { lat: round2(lat), lon: round2(lon), inland: true };
  }

  return { anchors, missingFromNe };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Render the module the app imports. Throws when a slug resolves nowhere —
 * every CORRIDOR_COUNTRIES entry must end up with an anchor, generated or
 * curated (the coverage the unit test re-asserts).
 */
export function renderCountryAnchorsModule(geojsonPath: string): string {
  const { anchors, missingFromNe } = computeGeneratedAnchors(geojsonPath);

  const uncovered = missingFromNe.filter((slug) => !(slug in CURATED_ANCHORS));
  if (uncovered.length > 0) {
    throw new Error(
      `no NE polygon and no curated anchor for: ${uncovered.join(", ")} — add them to CURATED_ANCHORS`,
    );
  }

  const lines: string[] = [];
  lines.push("/**");
  lines.push(" * Country-level port-area anchors for the corridor's country selects:");
  lines.push(" * one representative harbour-approach coordinate per country — NOT a");
  lines.push(" * specific port. Selecting two countries is enough to draw the corridor");
  lines.push(" * and route a sea distance; typed port coordinates always overwrite the");
  lines.push(" * anchor, and the anchor itself is a render-time fallback, never stored");
  lines.push(" * in a scenario. `inland: true` marks landlocked countries anchored to");
  lines.push(" * the nearest reasonable coast (a neighbour's, or the country's actual");
  lines.push(" * export corridor for Caspian-only states).");
  lines.push(" *");
  lines.push(" * Generated from data/geo/ne_110m_countries.geojson (Natural Earth 110m,");
  lines.push(" * public domain) by scripts/geo/gen-country-anchors.ts - do not");
  lines.push(" * hand-edit; re-run the script instead (curated entries live in");
  lines.push(" * scripts/lib/countryAnchorsGen.ts).");
  lines.push(" */");
  lines.push("");
  lines.push("export interface CountryAnchor {");
  lines.push("  lat: number;");
  lines.push("  lon: number;");
  lines.push("  /** Landlocked: the anchor is a neighbouring coast, not its own. */");
  lines.push("  inland?: true;");
  lines.push("}");
  lines.push("");
  lines.push("/** Geometry-derived anchors (coastal vertex nearest the country label,");
  lines.push(" *  nudged ~25 km seaward; landlocked -> nearest neighbouring coast). */");
  lines.push("export const GENERATED_ANCHORS: Record<string, CountryAnchor> = {");
  for (const [slug, a] of Object.entries(anchors)) {
    lines.push(`  "${slug}": { lat: ${a.lat}, lon: ${a.lon}${a.inland ? ", inland: true" : ""} },`);
  }
  lines.push("};");
  lines.push("");
  lines.push("/** Hand-curated overrides - they win over the generated table. */");
  lines.push("export const CURATED_ANCHORS: Record<string, CountryAnchor> = {");
  for (const [slug, a] of Object.entries(CURATED_ANCHORS)) {
    lines.push(
      `  "${slug}": { lat: ${a.lat}, lon: ${a.lon}${a.inland ? ", inland: true" : ""} }, // ${a.note}`,
    );
  }
  lines.push("};");
  lines.push("");
  lines.push("export const COUNTRY_ANCHORS: Record<string, CountryAnchor> = {");
  lines.push("  ...GENERATED_ANCHORS,");
  lines.push("  ...CURATED_ANCHORS,");
  lines.push("};");
  lines.push("");
  lines.push("/** The anchor for a country select value, if the country has one");
  lines.push(' *  ("other" and unknown ids resolve to none). */');
  lines.push("export function anchorForCountry(");
  lines.push("  countryId: string | null | undefined,");
  lines.push("): CountryAnchor | undefined {");
  lines.push("  return countryId ? COUNTRY_ANCHORS[countryId] : undefined;");
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}
