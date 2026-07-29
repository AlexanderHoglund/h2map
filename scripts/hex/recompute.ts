/**
 * Recompute every ready hex cell's LCOH with the current mapSweep, reusing
 * the cached resource profiles — NO provider calls, so it runs in seconds and
 * ignores rate limits. Use after changing the sweep (e.g. pricing regime) to
 * re-derive lcoh_best/solar/wind for the whole choropleth in place.
 *
 * Usage: npm run hex:recompute
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
import { makeCache, makeSupabase, makeTurbineLoader } from "../lib/serviceDeps";

const PAGE = 1000;

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

async function main(): Promise<void> {
  const db = makeSupabase();
  const wacc = await makeWaccResolver(db);
  console.log(`WACC resolver: ${wacc.countryCount} countries`);
  const deps = {
    // Guarantee no network: a cache miss on a ready cell is a data anomaly we
    // skip rather than silently refetch (which would hit rate limits).
    fetchJson: () => {
      throw new Error("cache miss (no network in recompute)");
    },
    cache: makeCache(db),
    getTurbineCurve: makeTurbineLoader(db),
    // The live map is improved mode, so recompute reads the IMPROVED profiles
    // (mode='improved'). Cells not yet re-seeded have no improved profile →
    // cache miss → skipped (no network), leaving their current values intact
    // rather than regressing them to reference. Once the re-seed reaches a
    // cell, recompute maintains it (and fills the #5/#6 layers for freshly
    // seeded cells).
    windAirDensityCorrection: true,
    windTurbineClassSelection: true,
    pvMaskUnservable: true,
  };

  let from = 0;
  let updated = 0;
  let skipped = 0;
  for (;;) {
    const { data, error } = await db
      .from("hex_lcoh")
      .select("h3")
      .eq("status", "ready")
      .order("h3")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    for (const { h3 } of data) {
      const [lat, lon] = cellToLatLng(h3);
      try {
        const pv = await getResourceProfile({ lat, lon, kind: "pv_fixed" }, deps);
        const wind = await getResourceProfile(
          { lat, lon, kind: "wind_120" },
          deps,
        );
        const profiles = { pv: pv.cf, wind: wind.cf };
        const years = mapSweepAllYears(profiles, MAP_FLAGS);
        const y2024 = years[2024];
        // Optional toggle layers (P1 #5 risk-adjusted WACC, P1 #6 best-achievable
        // sizing). Uniform/fixed defaults live in the base columns above.
        const cellWacc = wacc.resolve(lat, lon).wacc;
        const waccYears = mapSweepAllYears(profiles, MAP_FLAGS, cellWacc);
        const optimalYears = mapSweepOptimalAllYears(profiles, MAP_FLAGS);
        const { error: upErr } = await db
          .from("hex_lcoh")
          .update({
            lcoh_best: round3(y2024.best),
            lcoh_solar: y2024.solar === null ? null : round3(y2024.solar),
            lcoh_wind: y2024.wind === null ? null : round3(y2024.wind),
            best_pv_mw: y2024.bestPvMw,
            best_wind_mw: y2024.bestWindMw,
            lcoh_years: futureYearsJson(years),
            lcoh_wacc: allYearsBestJson(waccYears),
            lcoh_optimal: optimalYearsJson(optimalYears),
          })
          .eq("h3", h3);
        if (upErr) throw new Error(upErr.message);
        updated++;
      } catch (err) {
        skipped++;
        if (skipped <= 10) console.warn(`skip ${h3}: ${String(err)}`);
      }
    }

    console.log(`  ${from + data.length} scanned, ${updated} updated`);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`\nrecompute complete: ${updated} updated, ${skipped} skipped`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
