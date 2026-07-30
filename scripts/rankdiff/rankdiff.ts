/**
 * Rank-diff harness (spec Task 0) — the instrument that makes every model
 * change measurable on rank fidelity before it is merged.
 *
 *   npm run rankdiff -- benchmark   # select + persist ~500 stratified cells
 *   npm run rankdiff -- snapshot    # baseline LCOH + rank per layer/year
 *   npm run rankdiff -- report      # diff current model vs baseline
 *
 * All computation runs from CACHED resource profiles (no provider calls), so
 * a report reflects only the model/config change under test. When a P0/P1
 * change lands behind its flag, run `report` with that flag on (via the
 * change's own env/config) to see its effect on the benchmark.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cellToLatLng } from "h3-js";
import type { LCOHDecomposition } from "@h2map/lcoh-engine";
import { getResourceProfile } from "@h2map/profile-service";
import { IMPROVED_FLAGS, mapSweepAllYears } from "../lib/lcohSweep";
import {
  fetchJson,
  makeCache,
  makeSupabase,
  makeTurbineLoader,
  ROOT,
} from "../lib/serviceDeps";
import {
  classify,
  COST_YEARS,
  diffLayerYear,
  LAYERS,
  round,
  topComponents,
  type BenchCell,
  type Layer,
} from "./lib";

const DIR = `${ROOT}data/rankdiff`;
const BENCH = `${DIR}/benchmark.json`;
const BASELINE = `${DIR}/baseline.json`;
const TARGET = 500;
const PER_BUCKET_CAP = 110; // keep any one geography from dominating

/** Snapshot schema. v2 (Task 0d) added the per-component matrix. */
const SCHEMA_VERSION = 2;

type Vec = (number | null)[]; // per benchmark cell
/** matrix[layer][year] = value per cell */
type Matrix = Record<Layer, Record<number, Vec>>;
type CompVec = (LCOHDecomposition | null)[];
/** components[layer][year] = decomposition per cell (parallel to matrix). */
type CompMatrix = Record<Layer, Record<number, CompVec>>;

interface Snapshot {
  schemaVersion?: number;
  computedAt: string;
  order: string[]; // h3 in benchmark order
  matrix: Matrix;
  components?: CompMatrix;
}

function delayless() {
  // Cache-only: a miss on a benchmark cell is a data gap we skip, never a
  // provider call (which would perturb timing and hit rate limits).
  return () => {
    throw new Error("cache miss (rankdiff is cache-only)");
  };
}

async function elevations(
  coords: [number, number][],
): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < coords.length; i += 100) {
    const chunk = coords.slice(i, i + 100);
    const lat = chunk.map((c) => c[0].toFixed(4)).join(",");
    const lon = chunk.map((c) => c[1].toFixed(4)).join(",");
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`;
    const data = (await fetchJson(url)) as { elevation?: number[] };
    for (const e of data.elevation ?? []) out.push(Math.round(e));
    process.stdout.write(`  elevation ${Math.min(i + 100, coords.length)}/${coords.length}\r`);
  }
  console.log("");
  return out;
}

async function buildBenchmark(): Promise<void> {
  const db = makeSupabase();
  const { data, error } = await db
    .from("hex_lcoh")
    .select("h3, lat, lon, solar_cf, wind_cf")
    .eq("status", "ready");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as {
    h3: string;
    lat: number;
    lon: number;
    solar_cf: number | null;
    wind_cf: number | null;
  }[];
  console.log(`${rows.length} ready cells; fetching elevation…`);

  const elev = await elevations(rows.map((r) => [Number(r.lat), Number(r.lon)]));
  const all: BenchCell[] = rows.map((r, i) => {
    const lat = Number(r.lat);
    const elevationM = elev[i] ?? 0;
    return {
      h3: r.h3,
      lat,
      lon: Number(r.lon),
      elevationM,
      solarCf: r.solar_cf,
      windCf: r.wind_cf,
      bucket: classify(lat, elevationM, r.solar_cf, r.wind_cf),
    };
  });

  // Stratified sample: round-robin across buckets up to the per-bucket cap,
  // deterministic (sorted by h3) so the benchmark is stable across runs.
  const byBucket = new Map<string, BenchCell[]>();
  for (const c of all) (byBucket.get(c.bucket) ?? setDefault(byBucket, c.bucket)).push(c);
  for (const list of byBucket.values()) list.sort((a, b) => a.h3.localeCompare(b.h3));
  const picked: BenchCell[] = [];
  let round1 = 0;
  while (picked.length < TARGET && round1 < PER_BUCKET_CAP) {
    for (const list of byBucket.values()) {
      if (round1 < list.length && picked.length < TARGET) picked.push(list[round1]!);
    }
    round1++;
  }

  mkdirSync(DIR, { recursive: true });
  writeFileSync(BENCH, JSON.stringify({ createdCount: picked.length, cells: picked }, null, 1) + "\n");
  const counts: Record<string, number> = {};
  for (const c of picked) counts[c.bucket] = (counts[c.bucket] ?? 0) + 1;
  console.log(`benchmark: ${picked.length} cells`, counts);
}

function setDefault(m: Map<string, BenchCell[]>, k: string): BenchCell[] {
  const v: BenchCell[] = [];
  m.set(k, v);
  return v;
}

function loadBenchmark(): BenchCell[] {
  if (!existsSync(BENCH)) throw new Error(`no benchmark — run: npm run rankdiff -- benchmark`);
  return (JSON.parse(readFileSync(BENCH, "utf8")) as { cells: BenchCell[] }).cells;
}

function emptyMatrix<T>(): Record<Layer, Record<number, (T | null)[]>> {
  return {
    best: Object.fromEntries(COST_YEARS.map((y) => [y, []])) as Record<number, (T | null)[]>,
    solar: Object.fromEntries(COST_YEARS.map((y) => [y, []])) as Record<number, (T | null)[]>,
    wind: Object.fromEntries(COST_YEARS.map((y) => [y, []])) as Record<number, (T | null)[]>,
  };
}

/** Self-check: the plumbed decomposition must sum back to the total. */
function assertComponentsSum(lcoh: number, comp: LCOHDecomposition, where: string): void {
  const sum = Object.values(comp).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - lcoh) > 1e-9) {
    throw new Error(
      `component sum ${sum} != lcoh ${lcoh} at ${where} — harness plumbing bug`,
    );
  }
}

async function compute(
  cells: BenchCell[],
): Promise<{ matrix: Matrix; components: CompMatrix }> {
  // RANKDIFF_MODE=improved runs the accumulated improved-mode flag set so a
  // report quantifies its rank effect; default is the reference model.
  const flags = process.env.RANKDIFF_MODE === "improved" ? IMPROVED_FLAGS : {};
  const db = makeSupabase();
  const deps = {
    fetchJson: delayless(),
    cache: makeCache(db),
    getTurbineCurve: makeTurbineLoader(db),
  };
  const matrix = emptyMatrix<number>() as Matrix;
  const components = emptyMatrix<LCOHDecomposition>() as CompMatrix;
  let done = 0;
  for (const cell of cells) {
    const [lat, lon] = cellToLatLng(cell.h3);
    let years: ReturnType<typeof mapSweepAllYears> | null = null;
    try {
      const pv = await getResourceProfile({ lat, lon, kind: "pv_fixed" }, deps);
      const wind = await getResourceProfile({ lat, lon, kind: "wind_120" }, deps);
      years = mapSweepAllYears({ pv: pv.cf, wind: wind.cf }, flags);
    } catch {
      years = null; // cache gap — record nulls, cell drops out of metrics
    }
    for (const y of COST_YEARS) {
      const t = years?.[y];
      matrix.best[y]!.push(t ? t.best : null);
      matrix.solar[y]!.push(t ? t.solar : null);
      matrix.wind[y]!.push(t ? t.wind : null);
      const comp = t?.components;
      if (comp) {
        assertComponentsSum(t.best, comp.best, `${cell.h3} best ${y}`);
        if (t.solar !== null && comp.solar) assertComponentsSum(t.solar, comp.solar, `${cell.h3} solar ${y}`);
        if (t.wind !== null && comp.wind) assertComponentsSum(t.wind, comp.wind, `${cell.h3} wind ${y}`);
      }
      components.best[y]!.push(comp?.best ?? null);
      components.solar[y]!.push(comp?.solar ?? null);
      components.wind[y]!.push(comp?.wind ?? null);
    }
    if (++done % 100 === 0) process.stdout.write(`  computed ${done}/${cells.length}\r`);
  }
  console.log("");
  return { matrix, components };
}

async function snapshot(): Promise<void> {
  const cells = loadBenchmark();
  const { matrix, components } = await compute(cells);
  const snap: Snapshot = {
    schemaVersion: SCHEMA_VERSION,
    computedAt: new Date().toISOString(),
    order: cells.map((c) => c.h3),
    matrix,
    components,
  };
  writeFileSync(BASELINE, JSON.stringify(snap) + "\n");
  console.log(`baseline written for ${cells.length} cells (schema v${SCHEMA_VERSION})`);
}

async function report(): Promise<void> {
  const cells = loadBenchmark();
  if (!existsSync(BASELINE)) throw new Error(`no baseline — run: npm run rankdiff -- snapshot`);
  const base = JSON.parse(readFileSync(BASELINE, "utf8")) as Snapshot;
  if ((base.schemaVersion ?? 1) < SCHEMA_VERSION) {
    throw new Error(
      `baseline is schema v${base.schemaVersion ?? 1} (pre-component capture) — re-take it: npm run rankdiff -- snapshot (after removing the stale baseline)`,
    );
  }
  const cand = await compute(cells);

  const lines: string[] = ["# Rank-diff report", "", `Benchmark: ${cells.length} cells · baseline ${base.computedAt}`, ""];
  const json: Record<string, unknown>[] = [];

  for (const layer of LAYERS) {
    for (const y of COST_YEARS) {
      const b = base.matrix[layer][y]!;
      const c = cand.matrix[layer][y]!;
      const bComp = base.components?.[layer][y];
      const cComp = cand.components[layer][y]!;
      // keep cells where both are finite
      const keep: number[] = [];
      for (let i = 0; i < cells.length; i++) {
        if (b[i] != null && c[i] != null && Number.isFinite(b[i]) && Number.isFinite(c[i])) keep.push(i);
      }
      if (keep.length < 10) continue;
      const subCells = keep.map((i) => cells[i]!);
      const bl = keep.map((i) => b[i] as number);
      const cl = keep.map((i) => c[i] as number);
      const d = diffLayerYear(
        subCells,
        bl,
        cl,
        layer,
        y,
        bComp ? keep.map((i) => bComp[i] ?? null) : undefined,
        keep.map((i) => cComp[i] ?? null),
      );
      json.push(d as unknown as Record<string, unknown>);
      lines.push(
        `## ${layer} · ${y}  (n=${d.n})`,
        "",
        `- Spearman ρ ${d.spearman} · Kendall τ_b ${d.kendallTauB}`,
        `- top-50 churn ${(d.top50Churn * 100).toFixed(1)}% · top-decile retention ${(d.topDecileRetention * 100).toFixed(1)}%`,
        `- mean shift ${d.meanShift} USD/kg · by bucket ${JSON.stringify(d.meanShiftByBucket)}`,
      );
      if (d.meanComponentShift) {
        const nonZero = Object.entries(d.meanComponentShift).filter(([, v]) => v !== 0);
        if (nonZero.length > 0) {
          lines.push(
            `- mean component shift: ${nonZero.map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${v}`).join(" · ")}`,
          );
        }
      }
      if (Math.abs(d.top50Churn) > 0 || Math.abs(d.meanShift) > 1e-9) {
        lines.push("- largest movers:");
        for (const m of d.largestMovers.slice(0, 8)) {
          lines.push(
            `    ${m.h3} (${m.lat}, ${m.lon}) ${m.elevationM}m ${m.bucket}: ${m.baseline} → ${m.candidate} (${m.delta >= 0 ? "+" : ""}${m.delta})${topComponents(m.componentDeltas)}`,
          );
        }
      }
      lines.push("");
    }
  }

  writeFileSync(`${DIR}/report.md`, lines.join("\n"));
  writeFileSync(`${DIR}/report.json`, JSON.stringify({ generatedAt: base.computedAt, results: json }, null, 1) + "\n");
  // Console summary: the worst rank movement across all layer/years.
  const worst = json
    .map((r) => r as unknown as { layer: string; year: number; kendallTauB: number; top50Churn: number })
    .sort((a, b) => a.kendallTauB - b.kendallTauB)[0];
  console.log(`\nwrote ${DIR}/report.md`);
  if (worst) {
    console.log(`worst τ_b: ${worst.layer} ${worst.year} = ${round(worst.kendallTauB, 4)} (top-50 churn ${(worst.top50Churn * 100).toFixed(1)}%)`);
  }
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (cmd === "benchmark") await buildBenchmark();
  else if (cmd === "snapshot") await snapshot();
  else if (cmd === "report") await report();
  else {
    console.error("usage: npm run rankdiff -- <benchmark|snapshot|report>");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
