/**
 * Improved-profile re-seed — activation of P0 #1/#2/#4 on the live map.
 *
 * For each ready hex cell, fetch the IMPROVED resource profiles (air-density
 * corrected wind, IEC turbine-class selection, unified PVGIS-ERA5). They cache
 * under mode='improved' (see the profile MODE column), so they coexist with the
 * reference profiles the Chilean parity run validates against. Then recompute
 * the cell's map values — base + WACC (#5) + best-achievable (#6) — from the
 * improved profiles with the improved engine mode (MAP_FLAGS).
 *
 * Network-bound and rate-limited (Open-Meteo / PVGIS), so it is a MULTI-DAY job:
 * runs in bounded passes (SEED_MINUTES, default 40) and is resumable — a cell
 * whose improved profiles are already cached is a cache hit (no fetch). Ocean /
 * unresolvable cells are skipped. Set RESEED_LIMIT to cap the cell count (for a
 * smoke test).
 *
 *   npm run hex:reseed-improved
 */
import { cellToLatLng } from "h3-js";
import { getResourceProfile } from "@h2map/profile-service";
import {
  allYearsBestJson,
  futureYearsJson,
  MAP_FLAGS,
  mapSweepAllYears,
  mapSweepOptimalAllYears,
  optimalYearsJson,
} from "../lib/lcohSweep";
import { makeWaccResolver } from "../lib/countryWacc";
import {
  fetchJson,
  makeCache,
  makeSupabase,
  makeTurbineLoader,
} from "../lib/serviceDeps";

const PAGE = 500;
const round3 = (x: number): number => Math.round(x * 1000) / 1000;

async function main(): Promise<void> {
  const db = makeSupabase();
  const wacc = await makeWaccResolver(db);
  const deps = {
    fetchJson,
    cache: makeCache(db),
    getTurbineCurve: makeTurbineLoader(db),
    // The improved profile flags — these route reads/writes to mode='improved'
    // and fetch density-corrected wind + IEC class curve + PVGIS-ERA5 PV.
    windAirDensityCorrection: true,
    windTurbineClassSelection: true,
    pvUnifiedEra5: true,
    log: () => {},
  };

  const budgetMin = Number(process.env.SEED_MINUTES ?? 40);
  const limit = process.env.RESEED_LIMIT ? Number(process.env.RESEED_LIMIT) : Infinity;
  const deadline = Date.now() + budgetMin * 60_000;

  console.log(
    `improved re-seed: WACC ${wacc.countryCount} countries · budget ${budgetMin} min` +
      (Number.isFinite(limit) ? ` · limit ${limit} cells` : ""),
  );

  let from = 0;
  let updated = 0;
  let skipped = 0;
  let processed = 0;
  outer: for (;;) {
    const { data, error } = await db
      .from("hex_lcoh")
      .select("h3")
      .eq("status", "ready")
      .order("h3")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    for (const { h3 } of data) {
      if (Date.now() > deadline || processed >= limit) {
        console.log(`  stopping: ${processed >= limit ? "cell limit" : "time budget"} reached`);
        break outer;
      }
      processed++;
      const [lat, lon] = cellToLatLng(h3);
      try {
        // Cache hit if already re-seeded (no fetch); otherwise fetches improved.
        const pv = await getResourceProfile({ lat, lon, kind: "pv_fixed" }, deps);
        const wind = await getResourceProfile({ lat, lon, kind: "wind_120" }, deps);
        const profiles = { pv: pv.cf, wind: wind.cf };
        const years = mapSweepAllYears(profiles, MAP_FLAGS);
        const y = years[2024];
        const cellWacc = wacc.resolve(lat, lon).wacc;
        const waccYears = mapSweepAllYears(profiles, MAP_FLAGS, cellWacc);
        const optimalYears = mapSweepOptimalAllYears(profiles, MAP_FLAGS);
        const { error: upErr } = await db
          .from("hex_lcoh")
          .update({
            lcoh_best: round3(y.best),
            lcoh_solar: y.solar === null ? null : round3(y.solar),
            lcoh_wind: y.wind === null ? null : round3(y.wind),
            best_pv_mw: y.bestPvMw,
            best_wind_mw: y.bestWindMw,
            lcoh_years: futureYearsJson(years),
            lcoh_wacc: allYearsBestJson(waccYears),
            lcoh_optimal: optimalYearsJson(optimalYears),
          })
          .eq("h3", h3);
        if (upErr) throw new Error(upErr.message);
        updated++;
      } catch (err) {
        skipped++;
        if (skipped <= 10) console.warn(`  skip ${h3}: ${String(err)}`);
      }
      if (processed % 50 === 0) {
        const mins = ((Date.now() - (deadline - budgetMin * 60_000)) / 60_000).toFixed(1);
        console.log(`  ${processed} processed, ${updated} updated (${mins} min)`);
      }
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`\nimproved re-seed pass done: ${updated} updated, ${skipped} skipped, ${processed} scanned`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
