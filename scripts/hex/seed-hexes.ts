/**
 * Seed the hex_lcoh choropleth table region by region.
 *
 * For every H3 cell of the region polygon at the target resolution:
 * claim it (status 'computing'), resolve pv_fixed + wind_120 TMY profiles at
 * the cell centroid through the profile service (shared resource_profiles
 * cache), run the reference sweep, and flip the row to 'ready'. Idempotent —
 * ready cells are skipped, so re-runs resume where the last one stopped.
 *
 * Usage:
 *   npm run hex:seed                       # all regions, res 2
 *   npm run hex:seed -- chile-north 3     # one region at res 3
 */
import { cellToLatLng, getResolution, polygonToCells } from "h3-js";
import { ENGINE_VERSION } from "@h2map/lcoh-engine";
import { getResourceProfile } from "@h2map/profile-service";
import { futureYearsJson, MAP_FLAGS, mapSweepAllYears } from "../lib/lcohSweep";
import {
  fetchJson,
  makeCache,
  makeSupabase,
  makeTurbineLoader,
} from "../lib/serviceDeps";

/** Showcase regions as [lat, lng] boxes drawn over land. */
const REGIONS: Record<string, [number, number][]> = {
  "chile-north": [
    [-18, -70.5],
    [-18, -68],
    [-27, -68],
    [-27, -70.7],
  ],
  "chile-south": [
    [-48, -74],
    [-48, -68.5],
    [-54, -68.5],
    [-54, -74],
  ],
  // Polygon hugging Chile between Atacama and Magallanes (Andes crest east,
  // coast west) so the whole country is covered without swallowing Argentina.
  "chile-central": [
    [-27, -71.5],
    [-27, -68.5],
    [-31, -69.8],
    [-35, -69.6],
    [-39, -70.5],
    [-43, -71.2],
    [-48, -71.5],
    [-48, -74],
    [-43, -74.5],
    [-37, -73.9],
    [-33, -72.2],
    [-30, -71.9],
  ],
  // Full Namibia incl. the east toward Botswana and the Caprivi strip.
  namibia: [
    [-16.9, 13],
    [-17.2, 25.4],
    [-18.7, 25.4],
    [-19.2, 21],
    [-28.9, 20],
    [-28.9, 15.3],
    [-26, 14.5],
    [-22, 13.8],
    [-18, 11.8],
  ],
  // Mainland South Korea + Jeju.
  "south-korea": [
    [38.6, 125.9],
    [38.6, 129.7],
    [34.2, 129.7],
    [33.0, 126.9],
    [33.0, 125.9],
  ],
  // Australia incl. Tasmania (rough coastal hull).
  australia: [
    [-11, 142.5],
    [-12.5, 136.5],
    [-11.5, 131],
    [-14, 125.5],
    [-18, 122],
    [-21.5, 114],
    [-26.5, 112.5],
    [-34, 114.5],
    [-35.5, 117],
    [-34, 124],
    [-32, 133],
    [-35.5, 138],
    [-38.5, 141],
    [-39.5, 146.5],
    [-43.7, 146],
    [-43.5, 148.8],
    [-40.5, 148.5],
    [-37.5, 150.5],
    [-32.5, 153],
    [-27.5, 154],
    [-24.5, 152.8],
    [-20, 149],
    [-14.5, 144],
    [-10.7, 142.8],
  ],
  // India (rough border hull).
  india: [
    [8, 77],
    [8.5, 76.2],
    [12, 74.5],
    [16, 73],
    [20, 71],
    [22, 68.5],
    [24, 68.5],
    [27.5, 70.5],
    [31, 74],
    [33.5, 74.5],
    [34.5, 77],
    [32, 79],
    [28.5, 81],
    [27, 88.5],
    [26.5, 89.5],
    [26, 92],
    [28, 96],
    [27.5, 97],
    [24, 94.5],
    [22, 92.5],
    [21.5, 89],
    [19, 85],
    [15.5, 80.5],
    [12, 80],
    [9, 78.5],
  ],
  poland: [
    [54.8, 14.2],
    [54.8, 23.6],
    [50.8, 24.1],
    [49, 22.8],
    [49.4, 18.5],
    [50.3, 14.3],
  ],
  // Deep-detail showcase: Strait of Magellan / Punta Arenas core (res 5).
  "magallanes-core": [
    [-52, -72.5],
    [-52, -69.5],
    [-54.2, -69.5],
    [-54.2, -72.5],
  ],
  // Estonia + Latvia + Lithuania.
  baltics: [
    [59.6, 23],
    [59.6, 28.2],
    [57.5, 27.9],
    [55.7, 26.8],
    [53.9, 25.8],
    [53.9, 22.7],
    [55.3, 20.9],
    [56.5, 20.9],
    [57.8, 21.4],
    [58.5, 21.8],
  ],
  "north-europe": [
    [60, 4.5],
    [60, 15],
    [47, 15],
    [47, 4.5],
  ],
  // Scandinavian peninsula + Finland, hugging the SW–NE landmass diagonal.
  scandinavia: [
    [57.5, 5],
    [62, 4.5],
    [67, 11],
    [70, 15],
    [71.2, 25],
    [70, 30.5],
    [66, 30.5],
    [61.5, 31],
    [59.5, 27],
    [58, 22],
    [55, 15.5],
    [55, 11.5],
  ],
};

const DEFAULT_RES = 2;

/**
 * Depth-first region ladder for `--auto` (the GitHub Actions cron): each
 * region completes res 2 → 3 → 4 before the ladder moves to the next.
 * India/Australia stop at res 3 (their res-4 passes are a deliberate later
 * decision); the Magallanes core carries the res-5 showcase.
 */
const LADDER: [region: string, res: number][] = [
  ["chile-north", 2], ["chile-north", 3], ["chile-north", 4],
  ["chile-central", 2], ["chile-central", 3], ["chile-central", 4],
  ["chile-south", 2], ["chile-south", 3], ["chile-south", 4],
  ["magallanes-core", 5],
  ["namibia", 2], ["namibia", 3], ["namibia", 4],
  ["scandinavia", 2], ["scandinavia", 3], ["scandinavia", 4],
  ["south-korea", 2], ["south-korea", 3], ["south-korea", 4],
  ["poland", 2], ["poland", 3], ["poland", 4],
  ["baltics", 2], ["baltics", 3], ["baltics", 4],
  ["north-europe", 2], ["north-europe", 3], ["north-europe", 4],
  ["india", 2], ["india", 3],
  ["australia", 2], ["australia", 3],
];

/** Failed cells (mostly transient rate limits) are retried after this long. */
const FAILED_RETRY_MS = 7 * 24 * 3600 * 1000;

interface Deps {
  fetchJson: typeof fetchJson;
  cache: ReturnType<typeof makeCache>;
  getTurbineCurve: ReturnType<typeof makeTurbineLoader>;
  log: (m: string) => void;
}

async function main(): Promise<void> {
  const [regionArg, resArg] = process.argv.slice(2);

  const db = makeSupabase();
  const deps: Deps = {
    fetchJson,
    cache: makeCache(db),
    getTurbineCurve: makeTurbineLoader(db),
    log: (m: string) => console.log(`    ${m}`),
  };

  if (regionArg === "--auto") {
    const minutes = Number(process.env.SEED_MINUTES ?? 50);
    const deadline = Date.now() + minutes * 60_000;
    console.log(`auto mode: region ladder, ${minutes} min budget`);
    for (const [region, res] of LADDER) {
      const polygon = REGIONS[region];
      if (!polygon) throw new Error(`unknown region ${region}`);
      const done = await seedCells(
        db,
        deps,
        `${region} @ res ${res}`,
        polygonToCells(polygon, res),
        deadline,
      );
      if (!done) {
        console.log(`\nbudget exhausted during ${region} @ res ${res}`);
        return;
      }
    }
    // Priority ladder done — continue with every country on Earth,
    // depth-first per country, smallest-first (see worldProgram.ts).
    console.log("\nladder complete — continuing with the world program");
    const { loadWorldProgram } = await import("./worldProgram");
    for (const country of loadWorldProgram()) {
      for (const res of country.small ? [2, 3, 4] : [2, 3]) {
        const done = await seedCells(
          db,
          deps,
          `${country.name} @ res ${res}`,
          country.cells(res),
          deadline,
        );
        if (!done) {
          console.log(`\nbudget exhausted during ${country.name} @ res ${res}`);
          return;
        }
      }
    }
    console.log("\nworld program complete — every country at target depth");
    return;
  }

  const res = resArg ? Number(resArg) : DEFAULT_RES;
  const regions = regionArg ? [regionArg] : Object.keys(REGIONS);
  for (const region of regions) {
    await seedPass(db, deps, region, res, Number.POSITIVE_INFINITY);
  }
  console.log("\nseeding pass complete");
}

/** Seed one region at one resolution; returns false when the deadline hit. */
async function seedPass(
  db: ReturnType<typeof makeSupabase>,
  deps: Deps,
  region: string,
  res: number,
  deadline: number,
): Promise<boolean> {
  const polygon = REGIONS[region];
  if (!polygon) throw new Error(`unknown region ${region}`);
  return seedCells(
    db,
    deps,
    `${region} @ res ${res}`,
    polygonToCells(polygon, res),
    deadline,
  );
}

/** Ids to skip: already ready, or failed within the weekly retry window. */
async function loadSkipSet(
  db: ReturnType<typeof makeSupabase>,
  cells: string[],
): Promise<Set<string>> {
  const skip = new Set<string>();
  const cutoff = Date.now() - FAILED_RETRY_MS;
  const CHUNK = 500;
  for (let i = 0; i < cells.length; i += CHUNK) {
    const chunk = cells.slice(i, i + CHUNK);
    const { data, error } = await db
      .from("hex_lcoh")
      .select("h3, status, computed_at")
      .in("h3", chunk);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      if (r.status === "ready") skip.add(r.h3);
      else if (
        r.status === "failed" &&
        r.computed_at &&
        Date.parse(r.computed_at) > cutoff
      ) {
        skip.add(r.h3);
      }
    }
  }
  return skip;
}

/** Seed an explicit cell list; returns false when the deadline hit. */
async function seedCells(
  db: ReturnType<typeof makeSupabase>,
  deps: Deps,
  label: string,
  cells: string[],
  deadline: number,
): Promise<boolean> {
  // One batched query for the whole region's done/recently-failed cells,
  // instead of a SELECT per cell — keeps each auto run light as coverage
  // grows (fewer round-trips = shorter, more resilient jobs).
  const skip = await loadSkipSet(db, cells);
  console.log(
    `\n=== ${label}: ${cells.length} cells (${skip.size} already done) ===`,
  );

  for (const h3 of cells) {
    if (Date.now() > deadline) return false;
    if (skip.has(h3)) continue;

    const [lat, lon] = cellToLatLng(h3);
    const latR = Number(lat.toFixed(4));
    const lonR = Number(lon.toFixed(4));
    await db.from("hex_lcoh").upsert({
      h3,
      res: getResolution(h3),
      lat: latR,
      lon: lonR,
      status: "computing",
    });

    try {
      console.log(`  ${h3} (${latR}, ${lonR}):`);
      const pv = await getResourceProfile({ lat, lon, kind: "pv_fixed" }, deps);
      const wind = await getResourceProfile(
        { lat, lon, kind: "wind_120" },
        deps,
      );
      const years = mapSweepAllYears({ pv: pv.cf, wind: wind.cf }, MAP_FLAGS);
      const y = years[2024];
      const meanCf = (cf: number[]) =>
        Number((cf.reduce((a, b) => a + b, 0) / cf.length).toFixed(4));

      const { error } = await db.from("hex_lcoh").upsert({
        h3,
        res: getResolution(h3),
        lat: latR,
        lon: lonR,
        status: "ready",
        lcoh_best: round3(y.best),
        lcoh_solar: y.solar === null ? null : round3(y.solar),
        lcoh_wind: y.wind === null ? null : round3(y.wind),
        best_pv_mw: y.bestPvMw,
        best_wind_mw: y.bestWindMw,
        lcoh_years: futureYearsJson(years),
        solar_cf: meanCf(pv.cf),
        wind_cf: meanCf(wind.cf),
        engine_version: ENGINE_VERSION,
        computed_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
      console.log(
        `    ready: best ${y.best.toFixed(2)} (pv ${y.bestPvMw}/wind ${y.bestWindMw}) → 2050 ${years[2050].best.toFixed(2)}`,
      );
    } catch (err) {
      console.error(`    FAILED: ${String(err)}`);
      await db
        .from("hex_lcoh")
        .update({ status: "failed", computed_at: new Date().toISOString() })
        .eq("h3", h3);
    }
  }
  return true;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
