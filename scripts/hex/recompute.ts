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
import { mapSweep } from "../lib/lcohSweep";
import { makeCache, makeSupabase, makeTurbineLoader } from "../lib/serviceDeps";

const PAGE = 1000;

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

async function main(): Promise<void> {
  const db = makeSupabase();
  const deps = {
    // Guarantee no network: a cache miss on a ready cell is a data anomaly we
    // skip rather than silently refetch (which would hit rate limits).
    fetchJson: () => {
      throw new Error("cache miss (no network in recompute)");
    },
    cache: makeCache(db),
    getTurbineCurve: makeTurbineLoader(db),
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
        const s = mapSweep({ pv: pv.cf, wind: wind.cf });
        const { error: upErr } = await db
          .from("hex_lcoh")
          .update({
            lcoh_best: round3(s.best.lcoh),
            lcoh_solar: s.solarOnly === null ? null : round3(s.solarOnly),
            lcoh_wind: s.windOnly === null ? null : round3(s.windOnly),
            best_pv_mw: s.best.pvMw,
            best_wind_mw: s.best.windMw,
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
