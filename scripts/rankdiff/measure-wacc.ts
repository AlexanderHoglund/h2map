/**
 * P1 #5 rank measurement — risk-adjusted WACC. Unlike the profile items this is
 * a pure engine recompute (no re-fetch): each benchmark cell is re-solved at the
 * uniform reference WACC (0.08) and at its country's heuristic WACC, from the
 * SAME cached profiles, and the rankings are diffed. This is the change the spec
 * calls the single largest lever on decision value — the map stops ranking
 * resource alone and starts ranking project cost — so the expected result is a
 * large, deliberate reordering, not rank stability.
 *
 *   npm run rankdiff:wacc
 */
import { readFileSync } from "node:fs";
import { cellToLatLng } from "h3-js";
import { getResourceProfile } from "@h2map/profile-service";
import { mapSweepAllYears } from "../lib/lcohSweep";
import { makeWaccResolver, UNIFORM_WACC } from "../lib/countryWacc";
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
  const resolver = await makeWaccResolver(db);
  console.log(`resolver: ${resolver.countryCount} countries with a WACC`);
  const deps = {
    fetchJson: (() => {
      throw new Error("cache-only");
    }) as unknown as typeof fetchJson,
    cache: makeCache(db),
    getTurbineCurve: makeTurbineLoader(db),
  };

  const uni: number[] = [];
  const risk: number[] = [];
  const kept: BenchCell[] = [];
  const waccs: number[] = [];
  let matched = 0;
  let done = 0;

  for (const cell of cells) {
    const [lat, lon] = cellToLatLng(cell.h3);
    try {
      const pv = await getResourceProfile({ lat, lon, kind: "pv_fixed" }, deps);
      const wind = await getResourceProfile({ lat, lon, kind: "wind_120" }, deps);
      const r = resolver.resolve(lat, lon);
      const u = mapSweepAllYears({ pv: pv.cf, wind: wind.cf })[YEAR].best;
      const k = mapSweepAllYears({ pv: pv.cf, wind: wind.cf }, {}, r.wacc)[YEAR].best;
      uni.push(u);
      risk.push(k);
      kept.push(cell);
      waccs.push(r.wacc);
      if (r.source === "country-heuristic") matched++;
    } catch {
      // cache gap — skip
    }
    if (++done % 100 === 0) process.stdout.write(`  computed ${done}/${cells.length}\r`);
  }
  console.log("");

  const d = diffLayerYear(kept, uni, risk, "best", YEAR);
  const wSorted = [...waccs].sort((a, b) => a - b);
  const median = wSorted[Math.floor(wSorted.length / 2)]!;
  const spreadShift = kept.map((_, i) => risk[i]! - uni[i]!);
  const cheaper = spreadShift.filter((x) => x < -1e-9).length;
  const dearer = spreadShift.filter((x) => x > 1e-9).length;

  console.log("\n=== P1 #5 risk-adjusted WACC rank measurement (best · 2024) ===");
  console.log(
    `${kept.length} cells · ${matched} matched a country (${kept.length - matched} default ${UNIFORM_WACC})`,
  );
  console.log(
    `WACC applied: min ${round(wSorted[0]!, 3)} · median ${round(median, 3)} · max ${round(wSorted[wSorted.length - 1]!, 3)}`,
  );
  console.log(`vs uniform ${UNIFORM_WACC}: ${cheaper} cells cheaper, ${dearer} dearer`);
  console.log(
    `rank change: Spearman ρ ${d.spearman} · Kendall τ_b ${d.kendallTauB} · top-50 churn ${(d.top50Churn * 100).toFixed(1)}% · top-decile retention ${(d.topDecileRetention * 100).toFixed(1)}%`,
  );
  console.log(`mean shift ${d.meanShift} USD/kg · by bucket ${JSON.stringify(d.meanShiftByBucket)}`);
  console.log("largest movers:");
  for (const m of d.largestMovers.slice(0, 8)) {
    console.log(
      `  ${m.h3} (${m.lat}, ${m.lon}) ${m.bucket}: ${m.baseline} → ${m.candidate} (${m.delta >= 0 ? "+" : ""}${m.delta})`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
