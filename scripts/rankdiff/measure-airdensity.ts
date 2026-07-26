/**
 * P0 #1 rank measurement — the air-density correction changes the wind PROFILE,
 * not the engine, so it can't be read from cache. The resource cache is keyed by
 * (lat, lon, kind) with no dataset version, so a corrected request would just
 * hit the stored reference profile; this script therefore builds both the
 * reference and the density-corrected wind TMY directly from Open-Meteo (same
 * TMY pipeline the service uses) for a bounded sample — highest-elevation
 * benchmark cells plus sea-level controls — and diffs the resulting LCOH. It
 * isolates the correction exactly (identical PV, reference-vs-corrected wind)
 * and shows the effect is concentrated at elevation and ~0 at the coast. A
 * full-benchmark / global pass is a re-seeding job.
 *
 *   npm run rankdiff:airdensity
 */
import { readFileSync } from "node:fs";
import { cellToLatLng } from "h3-js";
import {
  buildTmy,
  fetchOpenMeteoWind,
  fillGaps,
  getResourceProfile,
  HOURS_PER_YEAR,
  type TurbineCurve,
} from "@h2map/profile-service";
import { mapSweepAllYears } from "../lib/lcohSweep";
import {
  fetchJson,
  makeCache,
  makeSupabase,
  makeTurbineLoader,
  ROOT,
} from "../lib/serviceDeps";
import { kendallTauB, ranks, round, spearman, type BenchCell } from "./lib";

const HIGH_ELEV = 16;
const CONTROLS = 6;
const MAX_GAP_HOURS = 0.05 * HOURS_PER_YEAR;

/** Reproduce the service's TMY build from a provider result (fill gaps, drop
 * years with >5 % missing, Finkelstein–Schafer month selection). */
function tmyCf(series: readonly { year: number; cf: readonly (number | null)[] }[]): number[] {
  const kept = series
    .map((y) => ({ year: y.year, filled: fillGaps(y.cf) }))
    .filter((y) => y.filled.gapHours <= MAX_GAP_HOURS)
    .map((y) => ({ year: y.year, cf: y.filled.cf }));
  if (kept.length === 0) throw new Error("no usable wind years");
  return buildTmy(kept).cf;
}

async function main(): Promise<void> {
  const cells = (
    JSON.parse(readFileSync(`${ROOT}data/rankdiff/benchmark.json`, "utf8")) as {
      cells: BenchCell[];
    }
  ).cells;

  const byElev = [...cells].sort((a, b) => b.elevationM - a.elevationM);
  const sample = [...byElev.slice(0, HIGH_ELEV), ...byElev.slice(-CONTROLS)];

  const db = makeSupabase();
  const getTurbineCurve = makeTurbineLoader(db);
  const curve: TurbineCurve = await getTurbineCurve();
  const pvDeps = {
    fetchJson,
    cache: makeCache(db),
    getTurbineCurve,
    log: () => {},
  };

  const rows: {
    cell: BenchCell;
    refBest: number;
    candBest: number;
    refWind: number | null;
    candWind: number | null;
    meanRho: string | undefined;
  }[] = [];

  for (const cell of sample) {
    const [lat, lon] = cellToLatLng(cell.h3);
    try {
      const pv = await getResourceProfile({ lat, lon, kind: "pv_fixed" }, pvDeps);
      const refRaw = await fetchOpenMeteoWind(fetchJson, lat, lon, 120, curve, {});
      const candRaw = await fetchOpenMeteoWind(fetchJson, lat, lon, 120, curve, {
        correctAirDensity: true,
      });
      const refWindCf = tmyCf(refRaw.series);
      const candWindCf = tmyCf(candRaw.series);
      const ref = mapSweepAllYears({ pv: pv.cf, wind: refWindCf })[2024];
      const cand = mapSweepAllYears({ pv: pv.cf, wind: candWindCf })[2024];
      rows.push({
        cell,
        refBest: ref.best,
        candBest: cand.best,
        refWind: ref.wind,
        candWind: cand.wind,
        meanRho: candRaw.notes?.find((n) => n.includes("mean rho")),
      });
      const w = (v: number | null) => (v == null ? "—" : round(v, 2));
      console.log(
        `  ${cell.elevationM}m ${cell.bucket}: best ${round(ref.best, 2)} → ${round(cand.best, 2)}  (wind ${w(ref.wind)} → ${w(cand.wind)})`,
      );
    } catch (err) {
      console.warn(`  skip ${cell.h3} (${cell.elevationM}m): ${String(err)}`);
    }
  }

  const high = rows.filter((r) => r.cell.elevationM >= 2000);
  const low = rows.filter((r) => r.cell.elevationM < 500);
  const mean = (rs: typeof rows, sel: (r: (typeof rows)[number]) => number) =>
    rs.length ? round(rs.reduce((a, r) => a + sel(r), 0) / rs.length, 3) : NaN;

  console.log("\n=== P0 #1 air-density rank measurement ===");
  console.log(
    `sample: ${rows.length} cells (${high.length} ≥2000 m, ${low.length} <500 m)`,
  );
  console.log(
    `best-layer mean shift:  high-elevation ${mean(high, (r) => r.candBest - r.refBest)}  ·  control ${mean(low, (r) => r.candBest - r.refBest)} USD/kg`,
  );
  const windRows = (rs: typeof rows) =>
    rs.filter((r) => r.refWind != null && r.candWind != null);
  console.log(
    `wind-layer mean shift:  high-elevation ${mean(windRows(high), (r) => (r.candWind as number) - (r.refWind as number))}  ·  control ${mean(windRows(low), (r) => (r.candWind as number) - (r.refWind as number))} USD/kg`,
  );
  const worst = [...high].sort(
    (a, b) => b.candBest - b.refBest - (a.candBest - a.refBest),
  )[0];
  if (worst) {
    console.log(
      `largest move: ${worst.cell.elevationM}m ${worst.cell.bucket}  best +${round(worst.candBest - worst.refBest, 2)} USD/kg  (${worst.meanRho ?? "?"})`,
    );
  }
  const rb = rows.map((r) => r.refBest);
  const cb = rows.map((r) => r.candBest);
  console.log(
    `sample rank stability (best 2024): Spearman ρ ${round(spearman(rb, cb), 4)} · Kendall τ_b ${round(kendallTauB(ranks(rb), ranks(cb)), 4)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
