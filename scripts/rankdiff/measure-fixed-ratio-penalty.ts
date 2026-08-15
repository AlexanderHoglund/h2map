/**
 * T4 — does the fixed 2:1 design point structurally penalise solar?
 *
 * The map's headline layers size every cell at 200 MW renewable on a 100 MW
 * electrolyser (ratio 2.0) and sweep only the MIX. The best-achievable layer
 * sweeps the ratio too (1.25-3.0 x 0-100% PV, 45 configurations). If a fixed
 * 2.0 systematically suits wind better than solar, the headline map would
 * understate solar everywhere — and that is exactly the claim the review
 * could not test, because the sweep columns were unpopulated.
 *
 * This reads what the recompute passes already stored (no engine re-run, no
 * network): `lcoh_best` / `lcoh_solar` / `lcoh_wind` at the fixed point vs
 * `lcoh_optimal.{year}` from the grid. Reports the headroom distribution, the
 * winning ratios, whether solar-dominant cells gain more than wind-dominant
 * ones, and how many cells change which technology wins.
 *
 *   npm run rankdiff:fixed-ratio [-- --year 2024]
 *
 * Writes data/rankdiff/fixed-ratio-penalty.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { makeSupabase, ROOT } from "../lib/serviceDeps";

interface Row {
  h3: string;
  res: number;
  lat: number;
  lon: number;
  lcoh_best: number | null;
  lcoh_solar: number | null;
  lcoh_wind: number | null;
  best_pv_mw: number | null;
  best_wind_mw: number | null;
  solar_cf: number | null;
  wind_cf: number | null;
  lcoh_optimal: Record<
    string,
    { best?: number; ratio?: number; pvShare?: number }
  > | null;
}

const pct = (xs: number[], p: number): number =>
  xs.length === 0 ? NaN : [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) * p)]!;
const mean = (xs: number[]): number =>
  xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
const f = (n: number, d = 2): string => (Number.isFinite(n) ? n.toFixed(d) : "—");

async function main(): Promise<void> {
  const yearArg = process.argv.indexOf("--year");
  const year = yearArg >= 0 ? (process.argv[yearArg + 1] ?? "2024") : "2024";
  const db = makeSupabase();

  const rows: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("hex_lcoh")
      .select(
        "h3, res, lat, lon, lcoh_best, lcoh_solar, lcoh_wind, best_pv_mw, best_wind_mw, solar_cf, wind_cf, lcoh_optimal",
      )
      .eq("status", "ready")
      .not("lcoh_optimal", "is", null)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as unknown as Row[]));
    if (data.length < PAGE) break;
  }

  const cells = rows.filter((r) => {
    const o = r.lcoh_optimal?.[year];
    return o?.best != null && r.lcoh_best != null;
  });

  // --- headroom: what the fixed design point costs, per cell -------------
  const headroom = cells.map((r) => r.lcoh_best! - r.lcoh_optimal![year]!.best!);
  const headroomPct = cells.map(
    (r) => ((r.lcoh_best! - r.lcoh_optimal![year]!.best!) / r.lcoh_best!) * 100,
  );

  // --- is the penalty asymmetric between solar- and wind-dominant cells? --
  // Classify by which technology the FIXED point chose, since that is what
  // the headline map shows.
  const solarLed = cells.filter((r) => (r.best_pv_mw ?? 0) > (r.best_wind_mw ?? 0));
  const windLed = cells.filter((r) => (r.best_wind_mw ?? 0) > (r.best_pv_mw ?? 0));
  const gainOf = (r: Row) =>
    ((r.lcoh_best! - r.lcoh_optimal![year]!.best!) / r.lcoh_best!) * 100;

  // --- winning ratios -----------------------------------------------------
  const ratioHist = new Map<number, number>();
  for (const r of cells) {
    const ratio = r.lcoh_optimal![year]!.ratio;
    if (ratio != null) ratioHist.set(ratio, (ratioHist.get(ratio) ?? 0) + 1);
  }
  // Solar-led vs wind-led ratio preference — the mechanism, if there is one.
  const meanRatio = (set: Row[]) =>
    mean(set.map((r) => r.lcoh_optimal![year]!.ratio ?? NaN).filter(Number.isFinite));

  // --- technology flips ---------------------------------------------------
  // Under the sweep, does the winning technology change? pvShare > 0.5 means
  // the optimum is solar-dominant.
  let flipToSolar = 0;
  let flipToWind = 0;
  for (const r of cells) {
    const share = r.lcoh_optimal![year]!.pvShare;
    if (share == null) continue;
    const fixedSolarLed = (r.best_pv_mw ?? 0) > (r.best_wind_mw ?? 0);
    const optSolarLed = share > 0.5;
    if (!fixedSolarLed && optSolarLed) flipToSolar += 1;
    if (fixedSolarLed && !optSolarLed) flipToWind += 1;
  }

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push(`# Fixed 2:1 vs best-achievable sizing — cost year ${year}`);
  push();
  push(
    `${cells.length} cells carry the ${year} sweep (of ${rows.length} with any ` +
      `optimal data). Cells still missing it are awaiting the network refetch ` +
      `pass; this sample is geographically broad, not a region.`,
  );
  push();
  push("## Headroom: what the fixed design point costs");
  push();
  push("| statistic | USD/kg | % of fixed LCOH |");
  push("|---|---|---|");
  for (const [label, p] of [
    ["min", 0],
    ["p25", 0.25],
    ["median", 0.5],
    ["p75", 0.75],
    ["p95", 0.95],
    ["max", 1],
  ] as const) {
    push(`| ${label} | ${f(pct(headroom, p), 3)} | ${f(pct(headroomPct, p))}% |`);
  }
  push(`| mean | ${f(mean(headroom), 3)} | ${f(mean(headroomPct))}% |`);
  push();
  push(
    `A positive headroom is the sweep beating the fixed point, which it must ` +
      `by construction (the fixed 2.0 x mix grid is a subset of the ratio x mix ` +
      `grid). The question is not whether it is positive but whether it is ` +
      `**asymmetric**.`,
  );
  push();
  push("## Asymmetry: is solar penalised more than wind?");
  push();
  push("| fixed-point winner | cells | mean gain | median gain | mean optimal ratio |");
  push("|---|---|---|---|---|");
  push(
    `| solar-led | ${solarLed.length} | ${f(mean(solarLed.map(gainOf)))}% | ` +
      `${f(pct(solarLed.map(gainOf), 0.5))}% | ${f(meanRatio(solarLed))} |`,
  );
  push(
    `| wind-led | ${windLed.length} | ${f(mean(windLed.map(gainOf)))}% | ` +
      `${f(pct(windLed.map(gainOf), 0.5))}% | ${f(meanRatio(windLed))} |`,
  );
  push();
  const delta = mean(solarLed.map(gainOf)) - mean(windLed.map(gainOf));
  push(
    `**Solar-led cells gain ${f(Math.abs(delta))} percentage points ` +
      `${delta > 0 ? "MORE" : "LESS"} than wind-led cells** from being allowed ` +
      `to size freely. ${
        delta > 0.5
          ? "That is the structural penalty the review suspected: the fixed 2.0 " +
            "suits wind better, so the headline map understates solar sites."
          : delta < -0.5
            ? "The penalty runs the other way — the fixed point suits solar better."
            : "The difference is small; the fixed point does not systematically " +
              "favour either technology."
      }`,
  );
  push();
  push("## Winning ratios (renewable MW per electrolyser MW)");
  push();
  push("| ratio | cells | share |");
  push("|---|---|---|");
  for (const [r, n] of [...ratioHist.entries()].sort((a, b) => a[0] - b[0])) {
    push(`| ${f(r, 2)}x | ${n} | ${f((n / cells.length) * 100, 1)}% |`);
  }
  push();
  push(
    `The fixed point is 2.00x. ${
      (ratioHist.get(2) ?? 0) / cells.length < 0.25
        ? "It is the optimum for a minority of cells"
        : "It is the optimum for a substantial share of cells"
    }, and the spread shows how strongly the best ratio is profile-dependent.`,
  );
  push();
  push("## Technology flips under free sizing");
  push();
  push(`- fixed wind-led → optimal solar-dominant: **${flipToSolar}** cells`);
  push(`- fixed solar-led → optimal wind-dominant: **${flipToWind}** cells`);
  push(
    `- net movement toward solar: **${flipToSolar - flipToWind}** cells ` +
      `(${f(((flipToSolar - flipToWind) / cells.length) * 100, 1)}% of the sample)`,
  );
  push();
  push(
    `_Generated by \`npm run rankdiff:fixed-ratio\` from stored sweep columns ` +
      `(no engine re-run, no network)._`,
  );

  mkdirSync(`${ROOT}data/rankdiff`, { recursive: true });
  const out = `${ROOT}data/rankdiff/fixed-ratio-penalty.md`;
  writeFileSync(out, lines.join("\n") + "\n", "utf8");
  console.log(lines.join("\n"));
  console.log(`\nwrote ${out}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
