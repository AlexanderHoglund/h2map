/**
 * Value-by-value verification: the engine, fed the workbook's exact default
 * inputs, against the workbook's own computed (cached) values.
 *
 *   npx tsx scripts/corridor/verify-vs-excel.ts
 *
 * Prints every summary metric, the resolved intermediates, and the max
 * absolute per-year deviation for all row series on both sides. Exits
 * non-zero if anything deviates beyond 1e-9 relative.
 */
import { readFileSync } from "node:fs";
import {
  migrateScenarioInput,
  parseRefBundle,
  resolveScenario,
} from "@h2map/corridor-schema";
import { evaluateScenario } from "@h2map/corridor-engine";

const ROOT = new URL("../../", import.meta.url);
const load = (rel: string): unknown =>
  JSON.parse(readFileSync(new URL(rel, ROOT), "utf8"));

const bundle = parseRefBundle(load("data/corridor-ref/2026-07-30-excel-v1.json"));
const input = migrateScenarioInput(load("fixtures/golden/corridor/excel-baseline.input.json")).input;
const excel = load("fixtures/golden/corridor/excel-baseline.expected.json") as {
  summary: Record<string, number>;
  intermediates: Record<string, number>;
  perYear: {
    green: Record<string, number[]>;
    fossil: Record<string, number[]>;
    co2AbatedTonnes: number[];
  };
};

const engine = evaluateScenario(resolveScenario(input, bundle));

let failures = 0;
const rel = (a: number, b: number): number =>
  a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-300);

function row(label: string, engineV: number, excelV: number): void {
  const d = rel(engineV, excelV);
  const ok = d <= 1e-9;
  if (!ok) failures++;
  console.log(
    `${ok ? "  =" : "  X"}  ${label.padEnd(28)} engine ${String(engineV).padEnd(22)} excel ${String(excelV).padEnd(22)} ${engineV === excelV ? "IDENTICAL" : `rel Δ ${d.toExponential(2)}`}`,
  );
}

console.log("Workbook: Green_Corridor_Model_Simplified_30_07.xlsx");
console.log("Inputs:   the workbook's own defaults (all overrides blank)\n");

console.log("SUMMARY (Calculation rows 70–85 + Output D26/D31)");
const eng = engine.summary as unknown as Record<string, number>;
for (const key of Object.keys(excel.summary)) row(key, eng[key]!, excel.summary[key]!);

console.log("\nRESOLVED INTERMEDIATES (Fuel!E15/E28, Vessel!E12)");
const engI = engine.intermediates as unknown as Record<string, number>;
for (const key of Object.keys(excel.intermediates)) row(key, engI[key]!, excel.intermediates[key]!);

console.log("\nPER-YEAR ROWS (max |Δ| across all 20 modelled years)");
for (const side of ["green", "fossil"] as const) {
  const engSide = engine.perYear[side] as unknown as Record<string, number[]>;
  for (const key of Object.keys(excel.perYear[side])) {
    const ev = engSide[key]!;
    const xv = excel.perYear[side][key]!;
    let worst = 0;
    for (let i = 0; i < xv.length; i++) worst = Math.max(worst, rel(ev[i]!, xv[i]!));
    const ok = worst <= 1e-9;
    if (!ok) failures++;
    console.log(
      `${ok ? "  =" : "  X"}  ${`${side}.${key}`.padEnd(30)} ${worst === 0 ? "all 20 years IDENTICAL" : `worst rel Δ ${worst.toExponential(2)}`}`,
    );
  }
}
{
  const ev = engine.perYear.co2AbatedTonnes;
  const xv = excel.perYear.co2AbatedTonnes;
  let worst = 0;
  for (let i = 0; i < xv.length; i++) worst = Math.max(worst, rel(ev[i]!, xv[i]!));
  console.log(
    `${worst <= 1e-9 ? "  =" : "  X"}  ${"co2AbatedTonnes".padEnd(30)} ${worst === 0 ? "all 20 years IDENTICAL" : `worst rel Δ ${worst.toExponential(2)}`}`,
  );
  if (worst > 1e-9) failures++;
}

console.log(
  failures === 0
    ? "\nRESULT: every value matches the workbook (tolerance 1e-9 relative)."
    : `\nRESULT: ${failures} value(s) DEVIATE — investigate.`,
);
if (failures > 0) process.exitCode = 1;
