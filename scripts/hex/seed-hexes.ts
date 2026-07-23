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
import { referenceSweep } from "../lib/lcohSweep";
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

async function main(): Promise<void> {
  const [regionArg, resArg] = process.argv.slice(2);
  const res = resArg ? Number(resArg) : DEFAULT_RES;
  const regions = regionArg ? [regionArg] : Object.keys(REGIONS);

  const db = makeSupabase();
  const deps = {
    fetchJson,
    cache: makeCache(db),
    getTurbineCurve: makeTurbineLoader(db),
    log: (m: string) => console.log(`    ${m}`),
  };

  for (const region of regions) {
    const polygon = REGIONS[region];
    if (!polygon) throw new Error(`unknown region ${region}`);
    const cells = polygonToCells(polygon, res);
    console.log(`\n=== ${region} @ res ${res}: ${cells.length} cells ===`);

    for (const h3 of cells) {
      const { data: existing } = await db
        .from("hex_lcoh")
        .select("status")
        .eq("h3", h3)
        .maybeSingle();
      if (existing?.status === "ready") {
        console.log(`  ${h3}: already ready, skipping`);
        continue;
      }

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
        const pv = await getResourceProfile(
          { lat, lon, kind: "pv_fixed" },
          deps,
        );
        const wind = await getResourceProfile(
          { lat, lon, kind: "wind_120" },
          deps,
        );
        const sweep = referenceSweep({ pv: pv.cf, wind: wind.cf });
        const meanCf = (cf: number[]) =>
          Number((cf.reduce((a, b) => a + b, 0) / cf.length).toFixed(4));

        const { error } = await db.from("hex_lcoh").upsert({
          h3,
          res: getResolution(h3),
          lat: latR,
          lon: lonR,
          status: "ready",
          lcoh_best: round3(sweep.best.lcoh),
          lcoh_solar: sweep.solarOnly === null ? null : round3(sweep.solarOnly),
          lcoh_wind: sweep.windOnly === null ? null : round3(sweep.windOnly),
          best_pv_mw: sweep.best.pvMw,
          best_wind_mw: sweep.best.windMw,
          solar_cf: meanCf(pv.cf),
          wind_cf: meanCf(wind.cf),
          engine_version: ENGINE_VERSION,
          computed_at: new Date().toISOString(),
        });
        if (error) throw new Error(error.message);
        console.log(
          `    ready: best ${sweep.best.lcoh.toFixed(2)} (pv ${sweep.best.pvMw}/wind ${sweep.best.windMw}), solar ${sweep.solarOnly?.toFixed(2)}, wind ${sweep.windOnly?.toFixed(2)}`,
        );
      } catch (err) {
        console.error(`    FAILED: ${String(err)}`);
        await db
          .from("hex_lcoh")
          .update({ status: "failed" })
          .eq("h3", h3);
      }
    }
  }
  console.log("\nseeding pass complete");
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
