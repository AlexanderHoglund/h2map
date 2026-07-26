/**
 * P0 #2 rank measurement — turbine-class selection changes the wind PROFILE
 * (the class curve depends on the site's mean speed), so like #1 it can't be
 * read from cache. For a bounded sample spanning the wind spectrum — lowest-CF
 * (→ Class III), mid, and strongest-wind (→ Class I) benchmark cells — this
 * builds both the reference (single generic curve) and the class-selected wind
 * TMY directly from Open-Meteo and diffs the LCOH, isolating the effect (same
 * PV, generic-vs-selected wind). It shows low-wind sites gaining and windy
 * sites paying the robust-turbine penalty they'd really incur.
 *
 *   npm run rankdiff:turbineclass
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

const LOW = 10;
const MID = 6;
const HIGH = 8;
const MAX_GAP_HOURS = 0.05 * HOURS_PER_YEAR;

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

  const byWind = cells
    .filter((c) => c.windCf != null)
    .sort((a, b) => (a.windCf as number) - (b.windCf as number));
  const mid = Math.floor(byWind.length / 2);
  const sample = [
    ...byWind.slice(0, LOW),
    ...byWind.slice(mid - Math.floor(MID / 2), mid - Math.floor(MID / 2) + MID),
    ...byWind.slice(-HIGH),
  ];

  const db = makeSupabase();
  const getTurbineCurve = makeTurbineLoader(db);
  const curve: TurbineCurve = await getTurbineCurve();
  const pvDeps = { fetchJson, cache: makeCache(db), getTurbineCurve, log: () => {} };

  const rows: {
    cell: BenchCell;
    cls: string;
    refBest: number;
    candBest: number;
    refWind: number | null;
    candWind: number | null;
  }[] = [];

  for (const cell of sample) {
    const [lat, lon] = cellToLatLng(cell.h3);
    try {
      const pv = await getResourceProfile({ lat, lon, kind: "pv_fixed" }, pvDeps);
      const refRaw = await fetchOpenMeteoWind(fetchJson, lat, lon, 120, curve, {});
      const candRaw = await fetchOpenMeteoWind(fetchJson, lat, lon, 120, curve, {
        selectClass: true,
      });
      const ref = mapSweepAllYears({ pv: pv.cf, wind: tmyCf(refRaw.series) })[2024];
      const cand = mapSweepAllYears({ pv: pv.cf, wind: tmyCf(candRaw.series) })[2024];
      const cls = candRaw.notes?.find((n) => n.includes("IEC class"))?.match(/class (\w+)/)?.[1] ?? "?";
      rows.push({ cell, cls, refBest: ref.best, candBest: cand.best, refWind: ref.wind, candWind: cand.wind });
      const w = (v: number | null) => (v == null ? "—" : round(v, 2));
      console.log(
        `  vcf ${round(cell.windCf as number, 2)} → class ${cls}: best ${round(ref.best, 2)} → ${round(cand.best, 2)}  (wind ${w(ref.wind)} → ${w(cand.wind)})`,
      );
    } catch (err) {
      console.warn(`  skip ${cell.h3}: ${String(err)}`);
    }
  }

  const mean = (rs: typeof rows, sel: (r: (typeof rows)[number]) => number) =>
    rs.length ? round(rs.reduce((a, r) => a + sel(r), 0) / rs.length, 3) : NaN;
  const wind = (rs: typeof rows, sel: (r: (typeof rows)[number]) => number) =>
    mean(rs.filter((r) => r.refWind != null && r.candWind != null), sel);
  const dBest = (r: (typeof rows)[number]) => r.candBest - r.refBest;
  const dWind = (r: (typeof rows)[number]) => (r.candWind as number) - (r.refWind as number);
  const iii = rows.filter((r) => r.cls === "III");
  const i = rows.filter((r) => r.cls === "I");

  console.log("\n=== P0 #2 turbine-class rank measurement ===");
  console.log(`sample: ${rows.length} cells (${iii.length} Class III, ${i.length} Class I)`);
  console.log(
    `wind-layer mean shift:  Class III ${wind(iii, dWind)}  ·  Class I ${wind(i, dWind)} USD/kg`,
  );
  console.log(
    `best-layer mean shift:  Class III ${mean(iii, dBest)}  ·  Class I ${mean(i, dBest)}  ·  all ${mean(rows, dBest)} USD/kg`,
  );
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
