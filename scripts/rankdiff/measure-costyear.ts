/**
 * P2 #10 measurement — cost-year coherence. Two things, both pure recompute:
 *   (a) Durability trajectory: the future packs now improve stack life and
 *       degradation alongside CAPEX. Quantify the future-year LCOH change vs
 *       the old CAPEX-only packs (flat 40 000 h / 1 %/yr). 2024 is identical.
 *   (b) Best-mix flips: solar CAPEX declines faster than wind, so the winning
 *       PV/wind mix flips in places between cost years. Count and characterise
 *       those flips — the data behind an explicit flip diff layer.
 *
 *   npm run rankdiff:costyear
 */
import { readFileSync } from "node:fs";
import { cellToLatLng } from "h3-js";
import { getResourceProfile } from "@h2map/profile-service";
import {
  COST_PACKS,
  COST_YEARS,
  mapSweep,
  mapSweepAllYears,
  TOTAL_RENEWABLE_MW,
  type CostPack,
  type CostYear,
} from "../lib/lcohSweep";
import {
  fetchJson,
  makeCache,
  makeSupabase,
  makeTurbineLoader,
  ROOT,
} from "../lib/serviceDeps";
import { round, type BenchCell } from "./lib";

/** Old CAPEX-only packs: same as current but durability held flat (2024 level). */
const FLAT_PACKS: Record<CostYear, CostPack> = Object.fromEntries(
  COST_YEARS.map((y) => [
    y,
    { ...COST_PACKS[y], stackLifetimeHours: 40_000, degradationPerYear: 0.01 },
  ]),
) as Record<CostYear, CostPack>;

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

  // (a) durability-trajectory shift per future year
  const durShift: Record<CostYear, number[]> = { 2024: [], 2030: [], 2040: [], 2050: [] };
  // (b) best PV share per year (from the fixed 2:1 sweep)
  const pvShare: Record<CostYear, number[]> = { 2024: [], 2030: [], 2040: [], 2050: [] };
  const kept: BenchCell[] = [];
  let done = 0;

  for (const cell of cells) {
    const [lat, lon] = cellToLatLng(cell.h3);
    try {
      const pv = await getResourceProfile({ lat, lon, kind: "pv_fixed" }, deps);
      const wind = await getResourceProfile({ lat, lon, kind: "wind_120" }, deps);
      const profiles = { pv: pv.cf, wind: wind.cf };
      const withTraj = mapSweepAllYears(profiles);
      kept.push(cell);
      for (const y of COST_YEARS) {
        const flat = mapSweep(profiles, FLAT_PACKS[y]).best.lcoh;
        durShift[y].push(withTraj[y].best - flat);
        pvShare[y].push(withTraj[y].bestPvMw / TOTAL_RENEWABLE_MW);
      }
    } catch {
      // cache gap — skip
    }
    if (++done % 100 === 0) process.stdout.write(`  computed ${done}/${cells.length}\r`);
  }
  console.log("");

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

  console.log("\n=== P2 #10 cost-year coherence ===");
  console.log(`${kept.length} cells`);
  console.log("(a) durability trajectory vs CAPEX-only (future-year LCOH shift):");
  for (const y of COST_YEARS) {
    const xs = durShift[y];
    const nonzero = xs.filter((x) => Math.abs(x) > 1e-9).length;
    console.log(
      `    ${y}: mean ${round(mean(xs), 3)} USD/kg · min ${round(Math.min(...xs), 3)} · ${nonzero}/${xs.length} changed${y === 2024 ? "  (must be 0 — invariant)" : ""}`,
    );
  }

  // (b) flips between 2024 and 2050 (share crossing 50 %, i.e. dominant source flips)
  const dom = (s: number) => (s > 0.5 ? "solar" : s < 0.5 ? "wind" : "tie");
  let towardSolar = 0;
  let towardWind = 0;
  let shareUp = 0;
  const shareShift: number[] = [];
  for (let i = 0; i < kept.length; i++) {
    const s24 = pvShare[2024][i]!;
    const s50 = pvShare[2050][i]!;
    shareShift.push(s50 - s24);
    if (s50 - s24 > 1e-9) shareUp++;
    const d24 = dom(s24);
    const d50 = dom(s50);
    if (d24 !== d50) {
      if (d50 === "solar") towardSolar++;
      else if (d50 === "wind") towardWind++;
    }
  }
  console.log("(b) best-mix flips 2024 → 2050 (solar declines faster than wind):");
  console.log(
    `    mean PV-share shift ${round(mean(shareShift), 3)} · ${shareUp}/${kept.length} cells shift toward more solar`,
  );
  console.log(
    `    dominant-source flips: ${towardSolar} → solar-led, ${towardWind} → wind-led (of ${kept.length})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
