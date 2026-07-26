/**
 * P1 #6 rank measurement — oversizing + mix. Pure engine recompute (no
 * re-fetch): each benchmark cell's fixed-2:1 best-LCOH (the current map value)
 * is compared against best-achievable over the ratio × mix grid, from the SAME
 * cached profiles. Reports the LCOH improvement, the winning ratio/mix
 * distribution, the rank change (cells can invert), and the per-cell compute
 * cost so a full-map rebuild budget can be set.
 *
 *   npm run rankdiff:oversize
 */
import { readFileSync } from "node:fs";
import { cellToLatLng } from "h3-js";
import { getResourceProfile } from "@h2map/profile-service";
import {
  mapSweepAllYears,
  mapSweepOptimal,
  OVERSIZE_RATIOS,
  MIX_SHARES,
} from "../lib/lcohSweep";
import { COST_PACKS } from "../lib/lcohSweep";
import {
  fetchJson,
  makeCache,
  makeSupabase,
  makeTurbineLoader,
  ROOT,
} from "../lib/serviceDeps";
import { diffLayerYear, round, type BenchCell } from "./lib";

const YEAR = 2024;

async function main(): Promise<void> {
  const cells = (
    JSON.parse(readFileSync(`${ROOT}data/rankdiff/benchmark.json`, "utf8")) as {
      cells: BenchCell[];
    }
  ).cells;

  const db = makeSupabase();
  const deps = {
    fetchJson: (() => {
      throw new Error("cache-only");
    }) as unknown as typeof fetchJson,
    cache: makeCache(db),
    getTurbineCurve: makeTurbineLoader(db),
  };

  const fixed: number[] = [];
  const opt: number[] = [];
  const kept: BenchCell[] = [];
  const ratioHist = new Map<number, number>();
  const shareShift: number[] = []; // optimal PV share − fixed 2:1 best share (approx via mix)
  let sweepMs = 0;
  let sweepCount = 0;
  let done = 0;

  for (const cell of cells) {
    const [lat, lon] = cellToLatLng(cell.h3);
    try {
      const pv = await getResourceProfile({ lat, lon, kind: "pv_fixed" }, deps);
      const wind = await getResourceProfile({ lat, lon, kind: "wind_120" }, deps);
      const profiles = { pv: pv.cf, wind: wind.cf };
      const fixedBest = mapSweepAllYears(profiles)[YEAR].best;
      const t0 = process.hrtime.bigint();
      const o = mapSweepOptimal(profiles, COST_PACKS[YEAR]);
      sweepMs += Number(process.hrtime.bigint() - t0) / 1e6;
      sweepCount++;
      if (!o) continue;
      fixed.push(fixedBest);
      opt.push(o.lcoh);
      kept.push(cell);
      ratioHist.set(o.ratio, (ratioHist.get(o.ratio) ?? 0) + 1);
      shareShift.push(o.pvShare);
    } catch {
      // cache gap — skip
    }
    if (++done % 100 === 0) process.stdout.write(`  computed ${done}/${cells.length}\r`);
  }
  console.log("");

  const d = diffLayerYear(kept, fixed, opt, "best", YEAR);
  const improvement = kept.map((_, i) => opt[i]! - fixed[i]!);
  const meanImp = improvement.reduce((a, b) => a + b, 0) / improvement.length;
  const maxImp = Math.min(...improvement);
  const gridSize = OVERSIZE_RATIOS.length * MIX_SHARES.length;
  const perCellMs = sweepMs / sweepCount;

  console.log("\n=== P1 #6 oversizing + mix rank measurement (best · 2024) ===");
  console.log(`${kept.length} cells · grid ${OVERSIZE_RATIOS.length} ratios × ${MIX_SHARES.length} shares = ${gridSize} configs/cell`);
  console.log(`LCOH vs fixed 2:1: mean ${round(meanImp, 3)} · best ${round(maxImp, 3)} USD/kg (always ≤ 0 — optimum ⊇ 2:1)`);
  console.log(
    `winning ratio distribution: ${[...OVERSIZE_RATIOS].map((r) => `${r}×:${ratioHist.get(r) ?? 0}`).join("  ")}`,
  );
  console.log(
    `rank change vs fixed 2:1: Spearman ρ ${d.spearman} · Kendall τ_b ${d.kendallTauB} · top-50 churn ${(d.top50Churn * 100).toFixed(1)}% · top-decile retention ${(d.topDecileRetention * 100).toFixed(1)}%`,
  );
  console.log(`mean shift by bucket ${JSON.stringify(d.meanShiftByBucket)}`);
  console.log("largest movers (improvement):");
  for (const m of d.largestMovers.slice(0, 8)) {
    console.log(`  ${m.h3} ${m.bucket}: ${m.baseline} → ${m.candidate} (${m.delta >= 0 ? "+" : ""}${m.delta})`);
  }
  console.log("\n--- compute budget ---");
  console.log(`per-cell optimal sweep: ${round(perCellMs, 2)} ms (${gridSize} configs × 4 cost years in the map pipeline)`);
  const perCellFull = perCellMs * 4; // all cost years
  for (const n of [50_000, 200_000, 1_000_000]) {
    console.log(`  ${n.toLocaleString()} cells → ${round((perCellFull * n) / 1000 / 60, 1)} min single-threaded`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
