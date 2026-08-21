/**
 * Generates apps/web/lib/corridor/countryAnchors.ts — one country-level
 * "port area" anchor per CORRIDOR_COUNTRIES slug, so selecting two
 * countries on the Intro tab is enough to draw the corridor and route a
 * sea distance. Source: data/geo/ne_110m_countries.geojson (Natural Earth
 * 110m, public domain). The derivation and the curated override table live
 * in scripts/lib/countryAnchorsGen.ts (regenerate-and-diff tested by
 * scripts/lib/countryAnchors.test.ts).
 *
 * Run: npx tsx scripts/geo/gen-country-anchors.ts
 * (Pattern: gen-route-map-land.ts.)
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import { renderCountryAnchorsModule } from "../lib/countryAnchorsGen";

const SRC = path.join(process.cwd(), "data/geo/ne_110m_countries.geojson");
const OUT = path.join(process.cwd(), "apps/web/lib/corridor/countryAnchors.ts");

const module_ = renderCountryAnchorsModule(SRC);
writeFileSync(OUT, module_, "utf8");
const anchors = (module_.match(/^  "/gm) ?? []).length;
console.log(`wrote ${OUT}: ${anchors} anchor entries, ${(module_.length / 1024).toFixed(0)} KB`);
