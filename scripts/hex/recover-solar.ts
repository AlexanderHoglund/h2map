/**
 * Targeted solar recovery for Kenya (post-PVGIS-outage).
 *
 * The Kenya PV fix landed during an intermittent PVGIS 500 outage, so a batch of
 * cells lack solar (masked wind-only, or failed). A blunt `SEED_FORCE` re-seed
 * is WRONG here: it reprocesses every cell, so a transient 500 on a
 * currently-good cell (whose cached profile was purged) DOWNGRADES it to a
 * failed hole — coverage goes backwards while PVGIS is flaky.
 *
 * This script only touches cells that currently lack solar (`lcoh_solar IS
 * NULL`), so it can only UPGRADE them (→ solar when PVGIS serves, → wind-only
 * when it doesn't); cells that already have good solar are never reprocessed and
 * so can never be degraded. Idempotent and safe to run any time — pointless
 * while PVGIS is down (nothing recovers) but harmless. Gated behind the canary
 * health probe in the recovery workflow so it runs when PVGIS is broadly up.
 *
 *   npm run hex:recover-solar
 */
import { cellToLatLng } from "h3-js";
import { ENGINE_VERSION } from "@h2map/lcoh-engine";
import {
  allYearsBestJson,
  futureYearsJson,
  MAP_FLAGS,
  mapSweepAllYears,
  mapSweepOptimalAllYears,
  optimalYearsJson,
} from "../lib/lcohSweep";
import { fetchCfOrMask } from "../lib/fetchProfile";
import { makeWaccResolver } from "../lib/countryWacc";
import {
  fetchJson,
  makeCache,
  makeSupabase,
  makeTurbineLoader,
} from "../lib/serviceDeps";

// Kenya bounding box (the region under recovery).
const BBOX = { latMin: -5.2, latMax: 5.2, lonMin: 33.8, lonMax: 42.1 };

const round3 = (x: number): number => Math.round(x * 1000) / 1000;
const meanCf = (cf: number[]): number =>
  Number((cf.reduce((a, b) => a + b, 0) / cf.length).toFixed(4));

async function main(): Promise<void> {
  const db = makeSupabase();
  const wacc = await makeWaccResolver(db);
  const deps = {
    fetchJson,
    cache: makeCache(db),
    getTurbineCurve: makeTurbineLoader(db),
    windAirDensityCorrection: true,
    windTurbineClassSelection: true,
    pvMaskUnservable: true,
    validateProfiles: true,
    log: () => {},
  };

  // Only cells lacking solar — failed, masked wind-only, or mid-compute all have
  // lcoh_solar NULL. Cells with real solar are excluded → never degraded.
  const { data, error } = await db
    .from("hex_lcoh")
    .select("h3")
    .is("lcoh_solar", null)
    .gte("lat", BBOX.latMin)
    .lte("lat", BBOX.latMax)
    .gte("lon", BBOX.lonMin)
    .lte("lon", BBOX.lonMax);
  if (error) throw new Error(error.message);
  const cells = data ?? [];
  console.log(`recover-solar: ${cells.length} Kenya cells lack solar`);

  // Any provider failure (transient 500 or non-physical) → null for that source;
  // never throws, so a PV outage still lets the cell keep its valid wind.
  const safe = async (
    lat: number,
    lon: number,
    kind: "pv_fixed" | "wind_120",
  ): Promise<number[] | null> => {
    try {
      return await fetchCfOrMask(deps, lat, lon, kind);
    } catch {
      return null;
    }
  };

  let gotSolar = 0;
  let windOnly = 0;
  let stillDown = 0;
  for (const { h3 } of cells) {
    const [lat, lon] = cellToLatLng(h3);
    const pvCf = await safe(lat, lon, "pv_fixed");
    const windCf = await safe(lat, lon, "wind_120");
    if (!pvCf && !windCf) {
      stillDown++;
      continue; // leave the row as-is; retry a later run
    }
    const profiles = {
      ...(pvCf ? { pv: pvCf } : {}),
      ...(windCf ? { wind: windCf } : {}),
    };
    const years = mapSweepAllYears(profiles, MAP_FLAGS);
    const y = years[2024];
    const cellWacc = wacc.resolve(lat, lon).wacc;
    const waccYears = mapSweepAllYears(profiles, MAP_FLAGS, cellWacc);
    const optimalYears = mapSweepOptimalAllYears(profiles, MAP_FLAGS);
    const { error: upErr } = await db
      .from("hex_lcoh")
      .update({
        status: "ready",
        lcoh_best: round3(y.best),
        lcoh_solar: y.solar === null ? null : round3(y.solar),
        lcoh_wind: y.wind === null ? null : round3(y.wind),
        best_pv_mw: y.bestPvMw,
        best_wind_mw: y.bestWindMw,
        lcoh_years: futureYearsJson(years),
        lcoh_wacc: allYearsBestJson(waccYears),
        lcoh_optimal: optimalYearsJson(optimalYears),
        solar_cf: pvCf ? meanCf(pvCf) : null,
        wind_cf: windCf ? meanCf(windCf) : null,
        engine_version: ENGINE_VERSION,
        computed_at: new Date().toISOString(),
      })
      .eq("h3", h3);
    if (upErr) throw new Error(upErr.message);
    if (pvCf) gotSolar++;
    else windOnly++;
  }
  console.log(
    `recover-solar done: ${gotSolar} gained solar, ${windOnly} wind-only, ${stillDown} still unservable`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
